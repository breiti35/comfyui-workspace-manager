import asyncio
import inspect
import json
import threading
import os
import subprocess
from nodes import NODE_CLASS_MAPPINGS
import server
from aiohttp import web
BUILT_IN_NODE_TYPES = {
  "BasicScheduler",
  "CLIPLoader",
  "CLIPMergeSimple",
  "CLIPSave",
  "CLIPSetLastLayer",
  "CLIPTextEncode",
  "CLIPTextEncodeSDXL",
  "CLIPTextEncodeSDXLRefiner",
  "CLIPVisionEncode",
  "CLIPVisionLoader",
  "Canny",
  "CheckpointLoader",
  "CheckpointLoaderSimple",
  "CheckpointSave",
  "ConditioningAverage",
  "ConditioningCombine",
  "ConditioningConcat",
  "ConditioningSetArea",
  "ConditioningSetAreaPercentage",
  "ConditioningSetAreaStrength",
  "ConditioningSetMask",
  "ConditioningSetTimestepRange",
  "ConditioningZeroOut",
  "ControlNetApply",
  "ControlNetApplyAdvanced",
  "ControlNetLoader",
  "CropMask",
  "DiffControlNetLoader",
  "DiffusersLoader",
  "DualCLIPLoader",
  "EmptyImage",
  "EmptyLatentImage",
  "ExponentialScheduler",
  "FeatherMask",
  "FlipSigmas",
  "FreeU",
  "FreeU_V2",
  "GLIGENLoader",
  "GLIGENTextBoxApply",
  "GrowMask",
  "HyperTile",
  "HypernetworkLoader",
  "ImageBatch",
  "ImageBlend",
  "ImageBlur",
  "ImageColorToMask",
  "ImageCompositeMasked",
  "ImageCrop",
  "ImageInvert",
  "ImageOnlyCheckpointLoader",
  "ImageOnlyCheckpointSave",
  "ImagePadForOutpaint",
  "ImageQuantize",
  "ImageScale",
  "ImageScaleBy",
  "ImageScaleToTotalPixels",
  "ImageSharpen",
  "ImageToMask",
  "ImageUpscaleWithModel",
  "InpaintModelConditioning",
  "InvertMask",
  "JoinImageWithAlpha",
  "KSampler",
  "KSamplerAdvanced",
  "KSamplerSelect",
  "KarrasScheduler",
  "LatentAdd",
  "LatentBatch",
  "LatentBatchSeedBehavior",
  "LatentBlend",
  "LatentComposite",
  "LatentCompositeMasked",
  "LatentCrop",
  "LatentFlip",
  "LatentFromBatch",
  "LatentInterpolate",
  "LatentMultiply",
  "LatentRotate",
  "LatentSubtract",
  "LatentUpscale",
  "LatentUpscaleBy",
  "LoadImage",
  "LoadImageMask",
  "LoadLatent",
  "LoraLoader",
  "LoraLoaderModelOnly",
  "MaskComposite",
  "MaskToImage",
  "ModelMergeAdd",
  "ModelMergeBlocks",
  "ModelMergeSimple",
  "ModelMergeSubtract",
  "ModelSamplingContinuousEDM",
  "ModelSamplingDiscrete",
  "PatchModelAddDownscale",
  "PerpNeg",
  "PhotoMakerEncode",
  "PhotoMakerLoader",
  "PolyexponentialScheduler",
  "PorterDuffImageComposite",
  "PreviewImage",
  "RebatchImages",
  "RebatchLatents",
  "RepeatImageBatch",
  "RepeatLatentBatch",
  "RescaleCFG",
  "SDTurboScheduler",
  "SD_4XUpscale_Conditioning",
  "SVD_img2vid_Conditioning",
  "SamplerCustom",
  "SamplerDPMPP_2M_SDE",
  "SamplerDPMPP_SDE",
  "SaveAnimatedPNG",
  "SaveAnimatedWEBP",
  "SaveImage",
  "SaveLatent",
  "SelfAttentionGuidance",
  "SetLatentNoiseMask",
  "SolidMask",
  "SplitImageWithAlpha",
  "SplitSigmas",
  "StableZero123_Conditioning",
  "StableZero123_Conditioning_Batched",
  "StyleModelApply",
  "StyleModelLoader",
  "TomePatchModel",
  "UNETLoader",
  "UpscaleModelLoader",
  "VAEDecode",
  "VAEDecodeTiled",
  "VAEEncode",
  "VAEEncodeForInpaint",
  "VAEEncodeTiled",
  "VAELoader",
  "VAESave",
  "VPScheduler",
  "VideoLinearCFGGuidance",
  "unCLIPCheckpointLoader",
  "unCLIPConditioning"
}

# Git info per custom-node directory. Every node class of a pack lives in the
# same directory, so without this a workflow with 30 nodes from one pack ran
# 60 git subprocesses per request. The info only changes when a pack is
# updated, which requires a ComfyUI restart anyway (= fresh cache).
_repo_cache = {}
_repo_cache_lock = threading.Lock()


def _git_info_for_directory(directory):
    with _repo_cache_lock:
        if directory in _repo_cache:
            return _repo_cache[directory]

    result = None
    try:
        git_repo = subprocess.check_output(
            ["git", "-C", directory, "config", "--get", "remote.origin.url"],
            text=True, stderr=subprocess.DEVNULL, timeout=10).strip()
        commit_hash = subprocess.check_output(
            ["git", "-C", directory, "rev-parse", "HEAD"],
            text=True, stderr=subprocess.DEVNULL, timeout=10).strip()
        if git_repo.endswith(".git"):
            git_repo = git_repo[:-4]
        parts = git_repo.replace(":", "/").split("/")
        if len(parts) >= 2:
            result = {"gitRepo": f"{parts[-2]}/{parts[-1]}", "commitHash": commit_hash}
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError, OSError):
        # Not a git checkout, git missing, or hanging - no repo info.
        result = None

    with _repo_cache_lock:
        _repo_cache[directory] = result
    return result


def get_git_repo(node_type: str):
    if node_type not in NODE_CLASS_MAPPINGS:
        return None
    if node_type in BUILT_IN_NODE_TYPES:
        return None

    cls = NODE_CLASS_MAPPINGS[node_type]
    source_file = inspect.getfile(cls)
    directory = os.path.dirname(source_file)
    return _git_info_for_directory(directory)


def _fetch_node_repos_sync(nodetypes):
    repos_mapping = {}
    for nodetype in nodetypes:
        try:
            repo = get_git_repo(nodetype)
            if repo:
                repos_mapping[nodetype] = repo
        except Exception as e:
            print(f"Error fetching repo for {nodetype}: {e}")
    return repos_mapping


@server.PromptServer.instance.routes.post("/workspace/fetch_node_repos")  # Handle POST requests
async def fetch_node_repos(request):
    data = await request.json()
    nodetypes = data.get("nodes")
    if not nodetypes or not isinstance(nodetypes, list):
        return web.Response(status=400, text="NodeTypes parameter is required and should be a list of node types.")
    # git subprocesses block - keep them off the event loop, otherwise the
    # whole ComfyUI server (websocket, queue) stalls while this runs.
    repos_mapping = await asyncio.to_thread(_fetch_node_repos_sync, nodetypes)
    return web.Response(text=json.dumps(repos_mapping), content_type='application/json')
