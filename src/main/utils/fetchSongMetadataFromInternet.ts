import type { AppleITunesMusicAPI } from '../../types/apple_itunes_music_api';
import logger from '../logger';
import type { LastFMHitCache, LastFMTrackInfoApi } from '../../types/last_fm_api';

import type { GeniusLyricsAPI, GeniusSongMetadataResponse } from '../../types/genius_lyrics_api';
import type { DeezerTrackDataAPI, DeezerTrackResultsAPI } from '../../types/deezer_api';
import type { MusixmatchHitCache, MusixmatchLyricsAPI } from '../../types/musixmatch_lyrics_api';
import parseSongMetadataFromMusixmatchApiData from './parseSongMetadataFromMusixmatchApiData';
import { parseMusicmatchDataFromLyrics } from './fetchLyricsFromMusixmatch';

const resultsController = new AbortController();
const metadataController = new AbortController();

const musixmatchHitCache = { id: '' } as MusixmatchHitCache;

const MUSIXMATCH_BASE_URL = 'https://apic-desktop.musixmatch.com/';

async function fetchSongMetadataFromMusixmatch(songTitle: string, songArtist?: string) {
  const MUSIXMATCH_USER_TOKEN = import.meta.env.MAIN_VITE_MUSIXMATCH_DEFAULT_USER_TOKEN;
  if (typeof MUSIXMATCH_USER_TOKEN !== 'string') {
    logger.debug('MUSIXMATCH_USER_TOKEN not found.', { MUSIXMATCH_USER_TOKEN });
    throw new Error('MUSIXMATCH_USER_TOKEN not found');
  }

  const headers = {
    authority: 'apic-desktop.musixmatch.com',
    cookie: 'x-mxm-token-guid='
  };

  const url = new URL('/ws/1.1/macro.subtitles.get', MUSIXMATCH_BASE_URL);
  url.searchParams.set('namespace', 'lyrics_richsynched');
  url.searchParams.set('app_id', 'web-desktop-app-v1.0');
  url.searchParams.set('subtitle_format', 'mxm');
  url.searchParams.set('format', 'json');
  url.searchParams.set('usertoken', MUSIXMATCH_USER_TOKEN);
  url.searchParams.set('q_track', songTitle);
  if (songArtist) url.searchParams.set('q_artist', songArtist);

  try {
    const res = await fetch(url, { headers, signal: resultsController.signal });
    if (res.ok) {
      const data = (await res.json()) as MusixmatchLyricsAPI;
      const metadata = await parseSongMetadataFromMusixmatchApiData(data, true);
      const lyrics = await parseMusicmatchDataFromLyrics(data, 'ANY');

      if (metadata) {
        const { title, artist, duration, lang, album, album_artwork_urls } = metadata;
        const result: SongMetadataResultFromInternet = {
          title,
          album,
          artworkPaths: album_artwork_urls,
          duration,
          artists: [artist],
          language: lang,
          lyrics: lyrics ? lyrics.lyrics : undefined,
          source: 'MUSIXMATCH',
          // Musixmatch api isn't working as expected to provide searching for multiple hits.
          sourceId: title
        };

        musixmatchHitCache.id = metadata.title;
        musixmatchHitCache.data = result;

        return [result];
      }
    }
    logger.warn(`Failed to fetch song metadata from Musixmatch`, {
      status: res.status,
      statusText: res.statusText
    });
    return [];
  } catch (error) {
    logger.error(`Failed to fetch song metadata from Musixmatch`, { error });
    return [];
  }
}

const ITUNES_API_URL = 'https://itunes.apple.com/';
let itunesHitsCache: SongMetadataResultFromInternet[] = [];

async function fetchSongMetadataResultsFromITunes(
  songTitle: string,
  songArtist?: string
): Promise<SongMetadataResultFromInternet[]> {
  const url = new URL('/search', ITUNES_API_URL);
  url.searchParams.set('media', 'music');
  url.searchParams.set('term', `${songTitle} ${songArtist}`);

  const res = await fetch(url, { signal: resultsController.signal });

  if (res.ok) {
    itunesHitsCache = [];
    const data = (await res.json()) as AppleITunesMusicAPI;
    if (!data?.errorMessage && data?.resultCount && data?.resultCount > 0 && data?.results) {
      const { results } = data;
      const outputResults: SongMetadataResultFromInternet[] = [];

      for (let i = 0; i < results.length; i += 1) {
        const result = results[i];

        const metadata: SongMetadataResultFromInternet = {
          title: result.trackName,
          artists: [result.artistName],
          artworkPaths: [result.artworkUrl100],
          genres: [result.primaryGenreName],
          duration: result.trackTimeMillis / 1000,
          releasedYear: new Date(result.releaseDate).getFullYear(),
          source: 'ITUNES',
          sourceId: result.trackId.toString()
        };
        const highResArtwork = result?.artworkUrl100?.replace(/\d+x\d+\w*/, '1000x1000bb');
        if (highResArtwork) metadata.artworkPaths.push(highResArtwork);

        outputResults.push(metadata);
      }

      itunesHitsCache = outputResults;
      return outputResults;
    }
    logger.warn(`Failed to fetch song metadata from itunes api.`, { songArtist, songTitle });
  }
  logger.error('Failed to fetch song metadata results from LastFM', {
    status: res.status,
    statusText: res.statusText
  });
  return [];
}

const fetchSongMetadataFromItunes = (sourceId: string) => {
  for (let i = 0; i < itunesHitsCache.length; i += 1) {
    const hit = itunesHitsCache[i];
    if (hit.sourceId === sourceId) return hit;
  }

  logger.warn(`No hit found for the given sourceId.`, { sourceId });
  return undefined;
};

const LAST_FM_API_URL = 'http://ws.audioscrobbler.com/2.0/';
const lastFMHitCache = { id: '' } as LastFMHitCache;

async function fetchSongMetadataResultsFromLastFM(
  songTitle: string,
  songArtist?: string
): Promise<SongMetadataResultFromInternet[]> {
  const LAST_FM_API_KEY = import.meta.env.MAIN_VITE_LAST_FM_API_KEY;

  if (typeof LAST_FM_API_KEY !== 'string') {
    logger.error('LAST_FM_API_KEY not found.', { LAST_FM_API_KEY });
    throw new Error('LAST_FM_API_KEY not found');
  }

  const url = new URL(LAST_FM_API_URL);
  url.searchParams.set('method', 'track.getInfo');
  url.searchParams.set('format', 'json');
  url.searchParams.set('api_key', LAST_FM_API_KEY);
  url.searchParams.set('track', songTitle);
  if (songArtist) url.searchParams.set('artist', songArtist);

  const res = await fetch(url, { signal: resultsController.signal });

  if (res.ok) {
    const data = (await res.json()) as LastFMTrackInfoApi;

    if ('track' in data) {
      const { track } = data;
      const result: SongMetadataResultFromInternet = {
        title: track.name,
        artists: [track.artist.name],
        artworkPaths: track?.album?.image.map((x) => x['#text']) ?? [],
        album: track?.album?.title || 'Unknown Album Title',
        genres: track?.toptags?.tag ? track?.toptags?.tag.map((x) => x.name) : [],
        source: 'LAST_FM',
        // LastFM api isn't working as expected to provide searching for multiple hits.
        sourceId: track.name
      };

      lastFMHitCache.id = track.name;
      lastFMHitCache.data = result;

      return [result];
    }
  }

  logger.warn('Failed to fetch song metadata results from LastFM.', {
    status: res.status,
    statusText: res.statusText
  });
  return [];
}

const GENIUS_API_BASE_URL = 'https://api.genius.com/';

async function searchSongMetadataResultsInGenius(
  songTitle: string,
  songArtists?: string
): Promise<SongMetadataResultFromInternet[]> {
  const GENIUS_API_KEY = import.meta.env.MAIN_VITE_GENIUS_API_KEY;
  if (typeof GENIUS_API_KEY !== 'string') {
    logger.error('GENIUS_API_KEY not found.', { GENIUS_API_KEY });
    throw new Error('GENIUS_API_KEY not found.');
  }

  const query = `${songTitle}${songArtists ? ` ${songArtists}` : ''}`;

  const url = new URL('/search', GENIUS_API_BASE_URL);
  url.searchParams.set('q', query);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GENIUS_API_KEY}`
    },
    signal: resultsController.signal
  });

  if (res.ok) {
    const data = (await res.json()) as GeniusLyricsAPI;
    if (data?.meta?.status === 200) {
      const { hits } = data.response;
      const results = [] as SongMetadataResultFromInternet[];
      if (Array.isArray(hits) && hits.length > 0) {
        for (let i = 0; i < hits.length; i += 1) {
          if (hits[i].type === 'song') {
            const {
              id,
              title,
              primary_artist,
              featured_artists,
              header_image_url,
              release_date_components,
              song_art_image_url,
              language
            } = hits[i].result;
            results.push({
              title: title || 'Unknown Title',
              artists: [primary_artist.name, ...featured_artists.map((x) => x.name)],
              artworkPaths: [
                header_image_url,
                song_art_image_url,
                primary_artist.image_url,
                ...featured_artists.map((x) => x.image_url)
              ],
              releasedYear: release_date_components?.year,
              language: language || undefined,
              source: 'GENIUS',
              sourceId: id.toString()
            });
          }
        }
      }
      return results;
    }
  }

  logger.warn('Failed to fetch song metadata results from Genius.', {
    status: res.status,
    statusText: res.statusText
  });
  return [];
}

async function fetchSongMetadataFromGenius(
  geniusSongId: string
): Promise<SongMetadataResultFromInternet | undefined> {
  const GENIUS_API_KEY = import.meta.env.MAIN_VITE_GENIUS_API_KEY;

  if (typeof GENIUS_API_KEY !== 'string') {
    logger.debug('GENIUS_API_KEY not found.', { GENIUS_API_KEY });
    throw new Error('GENIUS_API_KEY not found.');
  }

  const url = new URL('/songs', GENIUS_API_BASE_URL);
  url.searchParams.set('q', geniusSongId);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GENIUS_API_KEY}`
    },
    signal: metadataController.signal
  });

  if (res.ok) {
    const data = (await res.json()) as GeniusSongMetadataResponse;
    if (data?.meta?.status === 200) {
      const { song } = data.response;

      return {
        title: song.title || 'Unknown Title',
        artists: [song.primary_artist.name, ...song.featured_artists.map((x) => x.name)],
        artworkPaths: [song.header_image_url, song.song_art_image_url, song.album.cover_art_url],
        album: song?.album?.name || 'Unknown Album Title',
        releasedYear: song.release_date ? new Date(song.release_date).getFullYear() : undefined,
        source: 'GENIUS',
        sourceId: song.id.toString()
      };
    }
    throw new Error(`ERROR : ${data?.meta?.status} : ${data.meta.message}`);
  }

  logger.warn('Failed to fetch song metadata from Genius.', {
    status: res.status,
    statusText: res.statusText
  });
  return undefined;
}

const DEEZER_BASE_URL = 'https://api.deezer.com';

async function searchSongMetadataResultsInDeezer(
  songTitle: string,
  songArtists?: string
): Promise<SongMetadataResultFromInternet[]> {
  const query = `track:"${songTitle}"${songArtists ? ` artist:"${songArtists}"` : ''}`;

  const url = new URL('/search', DEEZER_BASE_URL);
  url.searchParams.set('q', query);

  const res = await fetch(url, { signal: resultsController.signal });

  if (res.ok) {
    const data = (await res.json()) as DeezerTrackResultsAPI;
    if (data.data.length > 0) {
      const { data: hits } = data;
      const results = [] as SongMetadataResultFromInternet[];
      if (Array.isArray(hits) && hits.length > 0) {
        for (let i = 0; i < hits.length; i += 1) {
          if (hits[i].type === 'track') {
            const { id, title, artist, album, duration } = hits[i];
            results.push({
              title: title || 'Unknown Title',
              artists: artist ? [artist.name] : [],
              artworkPaths: [
                ...[
                  album?.cover,
                  album?.cover_big,
                  album?.cover_medium,
                  album?.cover_small,
                  album?.cover_xl
                ].filter((x) => x),
                ...[
                  artist?.picture,
                  artist?.picture_big,
                  artist?.picture_medium,
                  artist?.picture_small,
                  artist?.picture_xl
                ].filter((x) => x)
              ],
              duration,
              source: 'DEEZER',
              sourceId: id.toString()
            });
          }
        }
      }
      return results;
    }
    throw new Error(`No results found for the query in Deezer.`);
  }
  logger.warn(`Failed to fetch song metadata results from Deezer`, {
    status: res.status,
    statusText: res.statusText
  });
  return [];
}

async function fetchSongMetadataFromDeezer(
  deezerSongId: string
): Promise<SongMetadataResultFromInternet | undefined> {
  const url = new URL(`/track/${deezerSongId}`, DEEZER_BASE_URL);

  const res = await fetch(url, { signal: metadataController.signal });

  if (res.ok) {
    const data = (await res.json()) as DeezerTrackDataAPI;
    if (data) {
      const { title, contributors, album, release_date, id } = data;
      return {
        title: title || 'Unknown Title',
        artists: contributors.map((x) => x.name).filter((x) => x),
        artworkPaths: [
          ...[
            album?.cover,
            album?.cover_big,
            album?.cover_medium,
            album?.cover_small,
            album?.cover_xl
          ].filter((x) => x),
          ...contributors
            .map((contributor) => [
              contributor?.picture,
              contributor?.picture_big,
              contributor?.picture_medium,
              contributor?.picture_small,
              contributor?.picture_xl
            ])
            .flat(5)
            .filter((x) => x)
        ],
        album: album?.title || 'Unknown Album Title',
        releasedYear: new Date(release_date).getFullYear() || undefined,
        source: 'GENIUS',
        sourceId: id.toString()
      };
    }
    throw new Error(`Failed to fetch track meta data from Deezer.`);
  }
  logger.warn(`Failed to fetch song metadata from Deezer`, {
    status: res.status,
    statusText: res.statusText
  });
  return undefined;
}

export const searchSongMetadataResultsInInternet = async (
  songTitle: string,
  songArtsits = [] as string[]
) => {
  // resultsController.abort();
  const itunesHits = fetchSongMetadataResultsFromITunes(
    songTitle,
    songArtsits ? songArtsits.join(' ') : undefined
  ).catch((error) => logger.warn(`Failed to fetch song metadata hits from iTunes API.`, { error }));
  const geniusHits = searchSongMetadataResultsInGenius(
    songTitle,
    songArtsits ? songArtsits.join(' ') : undefined
  ).catch((error) => logger.warn(`Failed to fetch song metadata hits from Genius API.`, { error }));
  const lastFMHits = fetchSongMetadataResultsFromLastFM(
    songTitle,
    songArtsits ? songArtsits.join(' ') : undefined
  ).catch((error) => logger.warn(`Failed to fetch song metadata hits from LastFM API.`, { error }));
  const musixmatchHits = fetchSongMetadataFromMusixmatch(
    songTitle,
    songArtsits ? songArtsits.join(' ') : undefined
  ).catch((error) =>
    logger.warn(`Failed to fetch song metadata hits from Musixmatch API.`, { error })
  );
  const deezerHits = searchSongMetadataResultsInDeezer(
    songTitle,
    songArtsits ? songArtsits.join(' ') : undefined
  ).catch((error) =>
    logger.warn(`Failed to fetch song metadata hits from Deezer API.;`, { error })
  );

  const hits = await Promise.all([musixmatchHits, itunesHits, geniusHits, deezerHits, lastFMHits]);
  const allHits = hits.flat(2);

  if (Array.isArray(allHits) && allHits.length > 0) return allHits.filter((x) => x);
  return [];
};

export const fetchSongMetadataFromInternet = async (
  source: SongMetadataSource,
  sourceId: string
): Promise<SongMetadataResultFromInternet | undefined> => {
  // metadataController.abort();
  if (source === 'LAST_FM' && lastFMHitCache.id === sourceId) return lastFMHitCache.data;

  if (source === 'MUSIXMATCH' && musixmatchHitCache.id === sourceId) return musixmatchHitCache.data;

  if (source === 'ITUNES') {
    const metadata = fetchSongMetadataFromItunes(sourceId);
    if (metadata) return metadata;

    logger.debug(`Failed to fetch song metadata from itunes api hit cache.`);
    return undefined;
  }

  if (source === 'GENIUS') {
    const metadata = await fetchSongMetadataFromGenius(sourceId).catch((error) =>
      logger.debug(`Failed to fetch song metadata from Genius API.`, { error })
    );

    if (metadata) return metadata;
    return undefined;
  }

  if (source === 'DEEZER') {
    const metadata = await fetchSongMetadataFromDeezer(sourceId).catch((error) =>
      logger.debug(`Failed to fetch song metadata from Deezer API.`, { error })
    );

    if (metadata) return metadata;
    return undefined;
  }

  return undefined;
};
