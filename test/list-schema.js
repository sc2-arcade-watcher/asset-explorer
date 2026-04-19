import { z } from 'zod';

export const DEFAULT_ASSET_BASE = 'https://dist.sc2arcade.com/star-assets/';

export const AssetItemSchema = z.object({
    name: z.string().min(1),
    download: z.string(),
    image: z.string().min(1),
    description: z.string().optional(),
});

export const AssetListSchema = z.object({
    category: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    assetBase: z.string().url().default(DEFAULT_ASSET_BASE).optional(),
    items: z.array(AssetItemSchema),
});

export const ALLOWED_LISTS = [
    'art',
    'buttons',
    'consoles',
    'icons',
    'models',
    'overlays',
    'portraits',
    'sprites',
    'ui',
    'wireframes',
    'terrain-cliffs',
    'terrain-doodads',
    'terrain-tilesets',
];
