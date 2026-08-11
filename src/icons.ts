const paths: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/>',
  brush: '<path d="m14.6 4.3 5.1 5.1M12.8 6.1l5.1 5.1M5 13l8.9-8.9a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L11 19H5v-6Z"/>',
  picker: '<path d="m19 3 2 2-8.5 8.5-2-2L19 3ZM9.5 12.5 5 17v2h2l4.5-4.5M4 21h5"/>',
  undo: '<path d="M9 7 4 12l5 5M5 12h9a5 5 0 0 1 5 5"/>',
  redo: '<path d="m15 7 5 5-5 5m4-5h-9a5 5 0 0 0-5 5"/>',
  save: '<path d="M5 4h12l2 2v14H5V4Zm3 0v6h8V4M8 20v-6h8v6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/>',
  grid: '<path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5"/>',
  chevron: '<path d="m9 7 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8M4 3v5h5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  copy: '<path d="M8 8h11v11H8V8Zm-3 8H4V4h12v1"/>',
  texture: '<path d="M4 5h16v14H4V5Zm0 10 4-4 3 3 2-2 7 7M15.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
  pyramid: '<path d="m12 3 9 17H3L12 3Zm0 0v17M3 20l9-5 9 5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  cylinder: '<path d="M5 6c0-2 3.1-3 7-3s7 1 7 3v12c0 2-3.1 3-7 3s-7-1-7-3V6Zm0 0c0 2 3.1 3 7 3s7-1 7-3M5 18c0-2 3.1-3 7-3s7 1 7 3"/>',
  plane: '<path d="m4 15 12-7 4 3-12 7-4-3Zm4 3v2m12-9v2"/>',
  billboard: '<path d="M4 4h16v13H4V4Zm4 16h8m-4-3v3M7 13l3-3 2 2 2-2 3 3"/>',
  file: '<path d="M6 3h8l4 4v14H6V3Zm8 0v5h5"/>',
  arrowDown: '<path d="m7 10 5 5 5-5"/>',
};

export function icon(name: keyof typeof paths, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
