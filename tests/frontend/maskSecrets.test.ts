/**
 * Funktionstests fuer maskSecrets (utils/maskSecrets.ts).
 *
 * Der Civitai-API-Key haengt als ?token=... an Download-URLs, und die
 * Fehlermeldungen des Backends zitieren die URL. Bevor so ein Text in einem
 * Toast landet, muss der Key unkenntlich sein.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { maskSecrets } from "../../ui/src/utils/maskSecrets.ts";

const KEY = "abcdef1234567890abcdef1234567890";

test("token in einer URL wird maskiert, der Rest bleibt lesbar", () => {
  const text = `Download failed: https://civitai.com/api/download/models/123?type=Model&token=${KEY}&format=SafeTensor (403)`;
  const maskiert = maskSecrets(text);
  assert.ok(!maskiert.includes(KEY));
  assert.equal(
    maskiert,
    "Download failed: https://civitai.com/api/download/models/123?type=Model&token=***&format=SafeTensor (403)",
  );
});

test("token als erster Parameter, am Textende und mehrfach", () => {
  assert.equal(maskSecrets(`https://x/y?token=${KEY}`), "https://x/y?token=***");
  assert.equal(
    maskSecrets(`a?token=${KEY} und b?token=zweiter`),
    "a?token=*** und b?token=***",
  );
  assert.equal(maskSecrets(`token=${KEY}`), "token=***");
});

test("api_key, apikey und Bearer-Header werden ebenfalls maskiert", () => {
  assert.equal(maskSecrets(`?api_key=${KEY}`), "?api_key=***");
  assert.equal(maskSecrets(`&APIKEY=${KEY}`), "&APIKEY=***");
  assert.equal(
    maskSecrets(`Authorization: Bearer ${KEY}`),
    "Authorization: Bearer ***",
  );
});

test("Texte ohne Geheimnis bleiben unveraendert", () => {
  const text = "Connection reset while downloading model.safetensors";
  assert.equal(maskSecrets(text), text);
  assert.equal(maskSecrets(""), "");
  // "mytoken=" ist kein token-Parameter
  assert.equal(maskSecrets("mytoken=abc"), "mytoken=abc");
});
