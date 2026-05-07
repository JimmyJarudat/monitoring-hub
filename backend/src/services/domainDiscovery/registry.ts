import type { SubdomainDiscoveryPlugin } from "./types";
import { alienVaultPlugin } from "./plugins/alienVault";
import { assetfinderPlugin, subfinderPlugin } from "./plugins/cliTools";
import { commonCrawlPlugin } from "./plugins/commonCrawl";
import { crtShPlugin } from "./plugins/crtSh";
import { dnsWordlistPlugin } from "./plugins/dnsWordlist";
import { securityTrailsPlugin } from "./plugins/securityTrails";
import { waybackPlugin } from "./plugins/wayback";

export const subdomainDiscoveryPlugins: SubdomainDiscoveryPlugin[] = [
  crtShPlugin,
  subfinderPlugin,
  assetfinderPlugin,
  securityTrailsPlugin,
  alienVaultPlugin,
  commonCrawlPlugin,
  waybackPlugin,
  dnsWordlistPlugin,
];
