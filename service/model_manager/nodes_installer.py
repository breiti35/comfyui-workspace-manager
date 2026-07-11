from .model_installer import download_url_with_wget
import server
from aiohttp import web
import aiohttp
import requests
import folder_paths
import os
import sys
import threading
import subprocess  # don't remove this
from urllib.parse import urlparse
import subprocess
import os
import json
import urllib.request

workspace_path = os.path.join(os.path.dirname(__file__))
comfy_path = os.path.dirname(folder_paths.__file__)

@server.PromptServer.instance.routes.post("/workspace/install_nodes")
async def install_nodes(request):
    response = web.StreamResponse()
    response.headers['Content-Type'] = 'text/plain'
    await response.prepare(request)

    post_params = await request.json()
    nodes = post_params['nodes']

    tasks = []
    print(f"Installing custom nodes", nodes)
    custom_node_path = os.path.join(comfy_path, 'custom_nodes')
    for custom_node in nodes:
        gitUrl = custom_node['gitHtmlUrl']
        print(f"Cloning repository: {gitUrl}")
        run_script(["git", "clone", gitUrl+'.git'], custom_node_path)


def handle_stream(stream, prefix):
    for line in stream:
        print(prefix + line, end='')


def run_script(cmd, cwd='.'):
    if len(cmd) > 0 and cmd[0].startswith("#"):
        print(f"[model-manager] Unexpected behavior: `{cmd}`")
        return 0

    process = subprocess.Popen(
        cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

    stdout_thread = threading.Thread(
        target=handle_stream, args=(process.stdout, ""))
    stderr_thread = threading.Thread(
        target=handle_stream, args=(process.stderr, "[!]"))

    stdout_thread.start()
    stderr_thread.start()

    stdout_thread.join()
    stderr_thread.join()

    return process.wait()

