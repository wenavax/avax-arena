import type {MetadataRoute} from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://frostbite.pro/baseworld";
  const now = new Date("2026-06-14");
  return [
    {url: `${base}/`, lastModified: now, priority: 1},
    {url: `${base}/atlas`, lastModified: now, priority: 0.9},
    {url: `${base}/terms`, lastModified: now, priority: 0.3},
    {url: `${base}/content-policy`, lastModified: now, priority: 0.3},
  ];
}
