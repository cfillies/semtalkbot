const OPENAI_ENV_NAME = "OPENAI_API_KEY";
const SECRET_ENV_NAME = "SECRET_OPENAI_API_KEY";

export function getOpenAIApiKey(): string {
  const key =
    process.env[OPENAI_ENV_NAME] ??
    process.env[SECRET_ENV_NAME] ??
    "";

  const trimmedKey = key.trim();

  if (!trimmedKey) {
    throw new Error(
      [
        "OpenAI API key is missing.",
        `Set ${OPENAI_ENV_NAME} in the active local config file:`,
        "- `.localConfigs` for `npm run dev:teamsfx`",
        "- `.localConfigs.playground` for `npm run dev:teamsfx:playground`",
        "",
        `If you only have ${SECRET_ENV_NAME}, make sure the toolkit maps it into ${OPENAI_ENV_NAME}.`,
      ].join(" ")
    );
  }

  if (trimmedKey.startsWith("crypto_")) {
    throw new Error(
      [
        `Invalid OpenAI API key found in ${OPENAI_ENV_NAME}.`,
        "The value looks like a copied secret blob (`crypto_...`), not a real OpenAI key.",
        `Replace ${OPENAI_ENV_NAME} with an actual OpenAI key in the active local config file.`,
        "Use `.localConfigs` for `npm run dev:teamsfx` or `.localConfigs.playground` for `npm run dev:teamsfx:playground`.",
      ].join(" ")
    );
  }

  return trimmedKey;
}
