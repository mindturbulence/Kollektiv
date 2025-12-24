export interface Preset {
  name: string;
  width: number;
  height: number;
}

export const COMPOSER_PRESETS: { category: string; presets: Preset[] }[] = [
  {
    category: 'Social Media',
    presets: [
      { name: 'Square (1:1)', width: 1080, height: 1080 },
      { name: 'Portrait (4:5)', width: 1080, height: 1350 },
      { name: 'Story / Reel (9:16)', width: 1080, height: 1920 },
      { name: 'Landscape (16:9)', width: 1920, height: 1080 },
      { name: 'X / Twitter Post (16:9)', width: 1600, height: 900 },
    ],
  },
  {
    category: 'AI Training (Cropped)',
    presets: [
      { name: 'SD 1.5 (512x512)', width: 512, height: 512 },
      { name: 'SD 1.5 (768x768)', width: 768, height: 768 },
      { name: 'SDXL / FLUX (1024x1024)', width: 1024, height: 1024 },
    ],
  },
  {
    category: 'Digital & Screen',
    presets: [
      { name: 'HD (1920x1080)', width: 1920, height: 1080 },
      { name: '4K UHD (3840x2160)', width: 3840, height: 2160 },
      { name: 'Phone Wallpaper (Approx)', width: 1170, height: 2532 },
    ],
  },
  {
    category: 'Print (300 DPI)',
    presets: [
      { name: '4x6 in (Landscape)', width: 1800, height: 1200 },
      { name: '5x7 in (Landscape)', width: 2100, height: 1500 },
      { name: '8x10 in (Portrait)', width: 2400, height: 3000 },
      { name: 'A4 Paper (Landscape)', width: 3508, height: 2480 },
    ],
  },
];