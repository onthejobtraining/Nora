import { Vibrant } from 'node-vibrant/node';
import { timeEnd, timeStart } from '../utils/measureTimeUsage';
import logger from '../logger';
import {
  getGenresData,
  getPaletteData,
  getSongsData,
  setGenresData,
  setPaletteData,
  setSongsData
} from '../filesystem';
import { generateCoverBuffer } from '../parseSong/generateCoverBuffer';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import roundTo from '../../common/roundTo';
import { generateRandomId } from '../utils/randomId';

export const DEFAULT_SONG_PALETTE: PaletteData = {
  paletteId: 'DEFAULT_PALETTE',
  DarkMuted: {
    hex: '#104888',
    hsl: [0.589, 0.789, 0.3],
    population: 0
  },
  DarkVibrant: {
    hex: '#0d3e76',
    hsl: [0.589, 0.789, 0.26],
    population: 0
  },
  LightMuted: {
    hex: '#154383',
    hsl: [0.597, 0.716, 0.3],
    population: 0
  },
  LightVibrant: {
    hex: '#8cb4ec',
    hsl: [0.597, 0.716, 0.737],
    population: 8
  },
  Muted: {
    hex: '#104888',
    hsl: [0.589, 0.789, 0.3],
    population: 0
  },
  Vibrant: {
    hex: '#3c8ce8',
    hsl: [0.589, 0.789, 0.576],
    population: 2
  }
};

const generatePalette = async (artwork?: Buffer | string): Promise<PaletteData | undefined> => {
  if (artwork) {
    const palette = await Vibrant.from(artwork)
      .getPalette()
      .catch((error) => {
        logger.error(`Failed to parse a song artwork to get a color palette.`, {
          error
        });
      });

    if (palette) {
      const generatePaletteSwatch = <T extends typeof palette.DarkMuted>(
        nodeVibrantSwatch: T
      ): NodeVibrantPaletteSwatch | undefined => {
        if (nodeVibrantSwatch && Array.isArray(nodeVibrantSwatch.hsl)) {
          const [h, s, l] = nodeVibrantSwatch.hsl;

          const data: NodeVibrantPaletteSwatch = {
            population: nodeVibrantSwatch.population,
            hex: nodeVibrantSwatch.hex,
            hsl: [roundTo(h, 3), roundTo(s, 3), roundTo(l, 3)]
          };

          return data;
        }
        return undefined;
      };

      const outputPalette: PaletteData = {
        paletteId: generateRandomId(),
        Vibrant: generatePaletteSwatch(palette.Vibrant),
        LightVibrant: generatePaletteSwatch(palette.LightVibrant),
        DarkVibrant: generatePaletteSwatch(palette.DarkVibrant),
        Muted: generatePaletteSwatch(palette.Muted),
        LightMuted: generatePaletteSwatch(palette.LightMuted),
        DarkMuted: generatePaletteSwatch(palette.DarkMuted)
      };

      return outputPalette;
    }
    logger.warn('Generated artwork palette empty.');
    return undefined;
  }
  logger.warn('Empty input to generate a palette.');
  return DEFAULT_SONG_PALETTE;
};

const generatePalettesForSongs = async () => {
  const songs = getSongsData();
  const palettes = getPaletteData();

  if (Array.isArray(songs) && songs.length > 0) {
    let x = 0;
    const noOfNoPaletteSongs = songs.reduce((acc, song) => (!song.paletteId ? acc + 1 : acc), 0);

    if (noOfNoPaletteSongs > 0) {
      const start = timeStart();

      for (let i = 0; i < songs.length; i += 1) {
        const song = songs[i];
        if (!song.paletteId) {
          // const metadata = await musicMetaData.parseFile(song.path);

          const coverBuffer = await generateCoverBuffer(
            song.isArtworkAvailable ? `${song.songId}-optimized.webp` : undefined,
            true
          );

          const palette = await generatePalette(coverBuffer);

          // const swatch =
          //   palette && palette.DarkVibrant && palette.LightVibrant
          //     ? {
          //         DarkVibrant: palette.DarkVibrant,
          //         LightVibrant: palette.LightVibrant
          //       }
          //     : undefined;

          song.paletteId = palette?.paletteId;
          if (palette) palettes.push(palette);
          x += 1;

          sendMessageToRenderer({
            messageCode: 'SONG_PALETTE_GENERATING_PROCESS_UPDATE',
            data: { total: noOfNoPaletteSongs, value: x }
          });
        }
      }

      timeEnd(start, 'Time to finish generating palettes for songs');

      setSongsData(songs);
      setPaletteData(palettes);
      dataUpdateEvent('songs/palette');
    } else sendMessageToRenderer({ messageCode: 'NO_MORE_SONG_PALETTES' });
  }
};

export const getSelectedPaletteData = (paletteId?: string) => {
  const palettes = getPaletteData();

  if (paletteId) {
    for (const palette of palettes) {
      if (palette.paletteId === paletteId) return palette;
    }
  }
  return undefined;
};

const generatePalettesForGenres = async () => {
  const genres = getGenresData();
  const songs = getSongsData();

  if (Array.isArray(songs) && Array.isArray(genres) && songs.length > 0 && genres.length > 0) {
    let x = 0;
    const noOfNoPaletteGenres = genres.reduce(
      (acc, genre) => (!genre?.paletteId ? acc + 1 : acc),
      0
    );

    if (noOfNoPaletteGenres > 0) {
      const start = timeStart();

      for (let i = 0; i < genres.length; i += 1) {
        const genreArtworkName = genres[i].artworkName;
        if (!genres[i]?.paletteId) {
          if (genreArtworkName) {
            const artNameWithoutExt = genreArtworkName.split('.')[0];

            for (const song of songs) {
              if (song.songId === artNameWithoutExt) {
                genres[i].paletteId = song.paletteId;
                x += 1;
                break;
              }
            }
          } else {
            const coverBuffer = await generateCoverBuffer(
              genreArtworkName?.replace('.webp', '-optimized.webp'),
              true
            );

            const palette = await generatePalette(coverBuffer);

            genres[i].paletteId = palette?.paletteId;
            x += 1;
          }

          sendMessageToRenderer({
            messageCode: 'SONG_PALETTE_GENERATING_PROCESS_UPDATE',
            data: { total: noOfNoPaletteGenres, value: x }
          });
        }
      }
      timeEnd(start, 'Time to finish generating palettes for genres');

      setGenresData(genres);
      dataUpdateEvent('genres/backgroundColor');
    } else sendMessageToRenderer({ messageCode: 'NO_MORE_SONG_PALETTES' });
  }
};

export const generatePalettes = async () => {
  return generatePalettesForSongs()
    .then(() => {
      setTimeout(generatePalettesForGenres, 1000);
      return undefined;
    })
    .catch((error) => logger.error('Failed to generating palettes.', { error }));
};

export default generatePalette;
