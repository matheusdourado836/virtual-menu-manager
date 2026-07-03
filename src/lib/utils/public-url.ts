const defaultPublicAppUrl = "https://pediu.vercel.app";

export const getPublicAppUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || defaultPublicAppUrl;

  if (configuredUrl.includes("localhost") || configuredUrl.includes("127.0.0.1")) {
    return defaultPublicAppUrl;
  }

  return configuredUrl.replace(/\/+$/u, "");
};
