const defaultPublicAppUrl = "https://pediu.vercel.app";

export const getPublicAppUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || defaultPublicAppUrl;
  return configuredUrl.replace(/\/+$/u, "");
};
