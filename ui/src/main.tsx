import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ColorModeScript, type StyleFunctionProps } from "@chakra-ui/react";
import { ChakraProvider, extendTheme } from "@chakra-ui/react";
import { AlertDialogProvider } from "./components/AlertDialogProvider.tsx";
import { LanguageProvider } from "./i18n/LanguageContext.tsx";
import CSSReset from "./MyCSSReset.tsx";
import { waitForApp } from "./utils/comfyapp.ts";

const App = React.lazy(() =>
  import("./App.tsx").then(({ default: App }) => ({
    default: App,
  })),
);

/**
 * Since the z-index of other plug-ins is set to 1111111,
 * part of the content of our Drawer component is covered,
 * so the z-index is adjusted uniformly and multiplied by 10000 based on the default value.
 */
const zIndices = {
  hide: -1,
  auto: "auto",
  base: 0,
  docked: 10,
  dropdown: 10000000,
  sticky: 11000000,
  banner: 12000000,
  overlay: 13000000,
  modal: 14000000,
  popover: 15000000,
  skipLink: 16000000,
  toast: 17000000,
  tooltip: 18000000,
};

const theme = extendTheme({
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  zIndices,
  colors: {
    comfy: {
      // Tied to ComfyUI's own toolbar/menu background variable so our topbar
      // sits flush with ComfyUI's bar instead of reading as a foreign panel,
      // and so it follows along automatically when the user switches
      // ComfyUI's theme. Keeps our previous literal (measured via devtools
      // on ComfyUI's queue-button-group: rgb(38, 39, 41)) as a fallback in
      // case ComfyUI ever removes or renames the variable, or an older
      // ComfyUI build doesn't define it yet - without the fallback we'd
      // render invisible/transparent instead of merely "not perfectly
      // matched".
      topbarBg: "var(--comfy-menu-bg, #262729)",
    },
    // Overrides Chakra's built-in "blue" palette (instead of introducing a
    // new color key) so every colorScheme="blue" usage - the ones already in
    // the renovated areas (Models, Gallery, Downloads) as well as the ones
    // migrated off the old teal accent - share exactly one accent, matching
    // ComfyUI's own accent color (#0B8CE9, measured) at the 500 step. The
    // other steps are a standard HSL ramp at the same hue, so
    // Chakra's built-in dark-mode shade swap (Button/Tag/Tabs default to
    // e.g. blue.200/blue.300 in dark mode for contrast against their text)
    // keeps working unchanged - only the hue moves, not the contrast
    // behavior. blue.200 (the shade Button's dark solid variant uses as
    // background with gray.800 text) keeps a ~4.6:1 contrast ratio, which
    // passes WCAG AA for normal text.
    blue: {
      50: "#E7F4FD",
      100: "#D0E9FB",
      200: "#A1D3F7",
      300: "#68B9F3",
      400: "#36A4F2",
      500: "#0B8CE9",
      600: "#0975C3",
      700: "#075E9C",
      800: "#064674",
      900: "#052F4D",
    },
  },
  semanticTokens: {
    colors: {
      // Shared hover/active row highlight for file & folder list rows
      // (RecentFilesDrawer). Resolves to the same colorMode-dependent
      // literals ("#E2E8F0"/"#4A5568") that were previously duplicated.
      rowHoverBg: { default: "gray.200", _dark: "gray.600" },
      rowBorderColor: { default: "gray.200", _dark: "gray.700" },
      // Gallery left-nav surface + active item, kept in the same dark,
      // minimalist family as the topbar (comfy.topbarBg) and Models panel.
      galleryPanelBg: { default: "gray.50", _dark: "#202226" },
      galleryActiveBg: { default: "gray.200", _dark: "#2C2F34" },
    },
  },
  components: {
    Card: {
      baseStyle: (props: StyleFunctionProps) => ({
        container: {
          backgroundColor: props.colorMode === "dark" ? "#171B21" : "#F6F8FA",
        },
      }),
    },
  },
});

// hacky fix for chakra add extra className (chakra-ui-light) into body
// and resulted in user unable to copy new nodes into clipboard, because of this check: e.target.className === "litegraph"
// (https://github.com/comfyanonymous/ComfyUI/blob/57926635e8d84ae9eea4a0416cc75e363f5ede45/web/scripts/app.js#L861)
const targetNode = document.body;
const observerConfig = { attributes: true, attributeFilter: ["class"] };
// Callback function to execute when mutations are observed
const callback = function (
  mutationsList: MutationRecord[],
  _observer: MutationObserver,
) {
  // remove color-scheme property from <html> element, this made the checkboxes dark
  const htmlElement = document.documentElement;
  if (htmlElement.style.colorScheme === "dark") {
    // Remove the color-scheme property
    htmlElement.style.removeProperty("color-scheme");
  }

  // remove chakra from <body> class list, this broke the copy node feature
  for (const mutation of mutationsList) {
    if (mutation.type === "attributes" && mutation.attributeName === "class") {
      // remove all chakra classes from body element
      for (const className of targetNode.classList) {
        if (className.includes("chakra")) {
          targetNode.classList.remove(className);
        }
      }
    }
  }
};
const observer = new MutationObserver(callback);
observer.observe(targetNode, observerConfig);

function waitForDocumentBody() {
  return new Promise((resolve) => {
    if (document.body) {
      return resolve(document.body);
    }

    document.addEventListener("DOMContentLoaded", () => {
      resolve(document.body);
    });
  });
}

// wait for document.body to load so that the top menu is loaded and my react component has a place to mount
waitForDocumentBody()
  .then(() => waitForApp())
  .then(() => {
    const topbar = document.createElement("div");
    document.body.append(topbar);
    ReactDOM.createRoot(topbar).render(
      <React.StrictMode>
        <ChakraProvider
          resetCSS={false}
          disableGlobalStyle={true}
          theme={theme}
        >
          <CSSReset scope=".workspace_manager" />
          <ColorModeScript initialColorMode="dark" />
          <LanguageProvider>
            <AlertDialogProvider>
              <Suspense>
                <App />
              </Suspense>
            </AlertDialogProvider>
          </LanguageProvider>
        </ChakraProvider>
      </React.StrictMode>,
    );
  });
