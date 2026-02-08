import { describe, expect, it, vi } from 'vitest';
import {
  getPaletteInfo,
  getPaletteNameBySlug,
  getRandomPaletteName,
  paletteNames,
  palettes,
  titleToSlug,
} from '../js/colorPalettes.js';

describe('colorPalettes', () => {
  describe('palettes data structure', () => {
    it('exports a non-empty palettes object', () => {
      expect(palettes).toBeDefined();
      expect(Object.keys(palettes).length).toBeGreaterThan(0);
    });

    it('each palette has required properties', () => {
      for (const [name, palette] of Object.entries(palettes)) {
        expect(palette.title, `${name} missing title`).toBeDefined();
        expect(palette.song, `${name} missing song`).toBeDefined();
        expect(palette.artist, `${name} missing artist`).toBeDefined();
        expect(palette.url, `${name} missing url`).toBeDefined();
        expect(palette.audioFile, `${name} missing audioFile`).toBeDefined();
      }
    });

    it('all Spotify URLs are valid format', () => {
      for (const [name, palette] of Object.entries(palettes)) {
        expect(palette.url, `${name} has invalid Spotify URL`).toMatch(
          /^https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+$/,
        );
      }
    });

    it('all audio files follow naming convention', () => {
      for (const [name, palette] of Object.entries(palettes)) {
        expect(palette.audioFile, `${name} has invalid audioFile path`).toBe(
          `audio/${name}.mp3`,
        );
      }
    });
  });

  describe('paletteNames', () => {
    it('contains all palette keys', () => {
      expect(paletteNames).toEqual(Object.keys(palettes));
    });

    it('is an array of strings', () => {
      expect(Array.isArray(paletteNames)).toBe(true);
      paletteNames.forEach((name) => {
        expect(typeof name).toBe('string');
      });
    });
  });

  describe('titleToSlug', () => {
    it('converts title to lowercase', () => {
      expect(titleToSlug('Old School')).toBe('old-school');
    });

    it('replaces spaces with hyphens', () => {
      expect(titleToSlug('Vice City Nights')).toBe('vice-city-nights');
    });

    it('collapses multiple consecutive spaces into single hyphen', () => {
      expect(titleToSlug('Multiple   Spaces')).toBe('multiple-spaces');
    });

    it('handles single word titles', () => {
      expect(titleToSlug('Inferno')).toBe('inferno');
    });

    it('handles already lowercase input', () => {
      expect(titleToSlug('already lowercase')).toBe('already-lowercase');
    });
  });

  describe('getPaletteNameBySlug', () => {
    it('returns palette name for valid slug', () => {
      expect(getPaletteNameBySlug('old-school')).toBe('classic');
    });

    it('returns palette name for another valid slug', () => {
      expect(getPaletteNameBySlug('vice-city-nights')).toBe('miami');
    });

    it('returns undefined for non-existent slug', () => {
      expect(getPaletteNameBySlug('non-existent')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(getPaletteNameBySlug('')).toBeUndefined();
    });

    it('finds all palettes by their slugified titles', () => {
      for (const [name, palette] of Object.entries(palettes)) {
        const slug = titleToSlug(palette.title);
        expect(getPaletteNameBySlug(slug)).toBe(name);
      }
    });
  });

  describe('getRandomPaletteName', () => {
    it('returns a valid palette name', () => {
      const result = getRandomPaletteName();
      expect(paletteNames).toContain(result);
    });

    it('returns different values over multiple calls (probabilistic)', () => {
      const results = new Set();
      for (let i = 0; i < 100; i++) {
        results.add(getRandomPaletteName());
      }
      // With 12 palettes and 100 iterations, we should get multiple unique values
      expect(results.size).toBeGreaterThan(1);
    });

    it('uses Math.random internally', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = getRandomPaletteName();

      expect(result).toBe(paletteNames[0]);
      randomSpy.mockRestore();
    });

    it('returns last palette when Math.random returns 0.999', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999);

      const result = getRandomPaletteName();

      expect(result).toBe(paletteNames[paletteNames.length - 1]);
      randomSpy.mockRestore();
    });
  });

  describe('getPaletteInfo', () => {
    it('returns complete info for specified palette', () => {
      const info = getPaletteInfo('classic');

      expect(info.name).toBe('classic');
      expect(info.title).toBe('Old School');
      expect(info.song).toBe('Take On Me');
      expect(info.artist).toBe('a-ha');
      expect(info.url).toBe(
        'https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L',
      );
      expect(info.audioFile).toBe('audio/classic.mp3');
      expect(info.texturePath).toBe('textures/Rubik_baseColor_classic.png');
    });

    it('includes correct texture path for each palette', () => {
      for (const name of paletteNames) {
        const info = getPaletteInfo(name);
        expect(info.texturePath).toBe(`textures/Rubik_baseColor_${name}.png`);
      }
    });

    it('returns random palette info when no name provided', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const info = getPaletteInfo();

      expect(info.name).toBe(paletteNames[0]);
      randomSpy.mockRestore();
    });

    it('returns random palette info when null provided', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      const info = getPaletteInfo(null);

      expect(info.name).toBe(paletteNames[0]);
      randomSpy.mockRestore();
    });

    it('logs the palette selection', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      getPaletteInfo('miami');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Using color palette:',
        'miami',
        '-',
        'Vice City Nights',
      );
      consoleSpy.mockRestore();
    });
  });
});
