import { useContext, useEffect, useState } from "react";
import { Spinner } from "@chakra-ui/react";
import { IconPhoto } from "@tabler/icons-react";
import { useT } from "../../i18n/LanguageContext";
import { usePreviewImage } from "../../gallery/usePreviewImage";
import { app } from "../../utils/comfyapp";
import { CompactFrame, CopyButton, useCopied } from "./CompactParts";
import { extractLiveParams, type LiveParams } from "./liveParams";
import { OpenInLibraryContext } from "./openInLibraryContext";

/** Live preview: newest output large, current graph's parameters below. */
export default function LiveView() {
  const { t } = useT();
  const openInLibrary = useContext(OpenInLibraryContext);
  const { frames, isGenerating } = usePreviewImage();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [params, setParams] = useState<LiveParams | null>(null);
  const { copied, copy } = useCopied();

  // The graph is read again whenever a run starts or ends.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await app?.graphToPrompt(app.graph);
        if (!cancelled && data?.output)
          setParams(extractLiveParams(data.output));
      } catch {
        if (!cancelled) setParams(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGenerating]);

  const frame =
    frames.find((f) => f.id === pickedId) ?? frames[frames.length - 1];

  const rows: [string, string | undefined][] = params
    ? [
        [t("compact.param.model"), params.model],
        [t("compact.param.sampler"), params.sampler],
        [t("compact.param.steps"), params.steps],
        [t("compact.param.cfg"), params.cfg],
        [t("compact.param.seed"), params.seed],
        [t("compact.param.size"), params.size],
        [t("compact.param.loras"), params.loras],
      ]
    : [];

  return (
    <CompactFrame
      section="live"
      title={t("compact.nav.live")}
      count={
        isGenerating
          ? t("gallery.badge.running")
          : frame
            ? t("gallery.badge.preview")
            : undefined
      }
    >
      <div className="lib-cmp-live">
        {frame ? (
          <>
            <div className="lib-cmp-shot">
              <img src={frame.url} alt={t("gallery.badge.preview")} />
            </div>
            {frames.length > 1 && (
              <div className="lib-cmp-strip">
                {frames.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    className={f.id === frame.id ? "on" : undefined}
                    aria-pressed={f.id === frame.id}
                    aria-label={`${t("gallery.badge.preview")} ${i + 1}`}
                    onClick={() => setPickedId(f.id)}
                  >
                    <img src={f.url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : isGenerating ? (
          <div className="lib-cmp-empty">
            <Spinner />
            <span>{t("gallery.generatingWait")}</span>
          </div>
        ) : (
          <div className="lib-cmp-empty">
            <IconPhoto size={36} stroke={1.2} />
            <strong>{t("gallery.noPreviewYet")}</strong>
            <span>{t("gallery.noPreviewYet.description")}</span>
          </div>
        )}

        <button
          type="button"
          className="lib-btn lib-cmp-wide"
          onClick={() => openInLibrary("gallery", "preview")}
        >
          {t("compact.openInLibrary")}
        </button>

        {params && (
          <>
            <div className="lib-cmp-sigline">{t("gallery.creationData")}</div>
            <dl className="lib-cmp-params">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd title={v}>{v}</dd>
                  </div>
                ))}
            </dl>
            {(
              [
                ["pos", t("prompts.positiveShort"), params.positive],
                ["neg", t("prompts.negativeShort"), params.negative],
              ] as const
            )
              .filter(([, , text]) => text)
              .map(([id, label, text]) => (
                <div key={id} className="lib-cmp-prompt">
                  <div className="lib-cmp-prompt-head">
                    <span className="lib-cmp-sigline">{label}</span>
                    <CopyButton
                      label={`${t("compact.copy")}: ${label}`}
                      done={copied === id}
                      onClick={() => copy(text, id)}
                    />
                  </div>
                  <p title={text}>{text}</p>
                </div>
              ))}
          </>
        )}
      </div>
    </CompactFrame>
  );
}
