import { getCachedLyrics, updateCachedLyrics } from '../core/getSongLyrics';
import logger from '../logger';
import { sendMessageToRenderer } from '../main';
import { getLrcLyricsMetadata } from '../core/saveLyricsToLrcFile';
import { version } from '../../../package.json';
import { INSTRUMENTAL_LYRIC_IDENTIFIER } from '../../common/parseLyrics';
import { romanize } from 'romaja/src/romanize.js';
import isHangul from 'romaja/src/hangul/isHangul.js';

const hasConvertibleCharacter = (str: string) => {
  if (!str) return false;
  for (const c of str) if (isHangul(c)) return true;
  return false;
};

const convertText = (str: string) => {
  return romanize(str).trim();
};

const convertLyricsToRomaja = async () => {
  const cachedLyrics = getCachedLyrics();
  try {
    if (!cachedLyrics) return undefined;
    const { parsedLyrics } = cachedLyrics.lyrics;
    const lines: (string | SyncedLyricsLineWord[])[] = parsedLyrics.map(
      (line) => line.originalText
    );

    const convertedLyrics: string[][] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (typeof line === 'string') {
        if (!hasConvertibleCharacter(line)) convertedLyrics.push([]);
        else convertedLyrics.push([convertText(line)]);
      } else {
        const convertedSyncedWords: string[] = [];
        let convertedWordsCount = 0;
        for (let j = 0; j < line.length; j++) {
          const word = line[j];
          if (!hasConvertibleCharacter(word.text)) convertedSyncedWords.push(word.text.trim());
          else {
            convertedSyncedWords.push(convertText(word.text));
            convertedWordsCount++;
          }
        }
        if (convertedWordsCount > 0) convertedLyrics.push(convertedSyncedWords);
        else convertedLyrics.push([]);
      }
    }

    const lyricsArr: string[] = [];
    const { title, artist, album, lang, length, offset, copyright } =
      getLrcLyricsMetadata(cachedLyrics);

    lyricsArr.push(`[re:Nora (https://github.com/Sandakan/Nora)]`);
    lyricsArr.push(`[ve:${version}]`);
    lyricsArr.push(`[ti:${title}]`);

    if (artist) lyricsArr.push(`[ar:${artist}]`);
    if (album) lyricsArr.push(`[al:${album}]`);
    if (lang) lyricsArr.push(`[lang:${lang}]`);
    if (length) lyricsArr.push(`[length:${length}]`);
    if (typeof offset === 'number') lyricsArr.push(`[offset:${offset}]`);
    if (copyright) lyricsArr.push(`[copyright:${copyright}]`);

    for (let i = 0; i < parsedLyrics.length; i++) {
      const lyric = parsedLyrics[i];
      const convertedLyric = convertedLyrics.at(i);
      if (!convertedLyric || convertedLyric.length === 0) {
        lyric.romanizedText = '';
        continue;
      }
      if (lyric.isEnhancedSynced) {
        const enhancedLyrics: SyncedLyricsLineWord[] = new Array<SyncedLyricsLineWord>(
          lyric.originalText.length
        );
        for (let j = 0; j < enhancedLyrics.length; j++) {
          const originalEnhancedLyric = lyric.originalText.at(j) as SyncedLyricsLineWord;
          const enhancedLyric = {
            text: convertedLyric[j].trim().replaceAll('\n', ''),
            start: originalEnhancedLyric.start,
            end: originalEnhancedLyric.end,
            unparsedText: originalEnhancedLyric.unparsedText
          };
          enhancedLyrics[j] = enhancedLyric;
        }
        lyric.romanizedText = enhancedLyrics;
      } else {
        const convertedText = convertedLyric[0].trim();
        if (convertedText !== INSTRUMENTAL_LYRIC_IDENTIFIER)
          lyric.romanizedText = convertedText.replaceAll('\n', '');
      }
    }
    cachedLyrics.lyrics.isRomanized = true;
    cachedLyrics.lyrics.parsedLyrics = parsedLyrics;

    updateCachedLyrics(() => cachedLyrics);

    sendMessageToRenderer({
      messageCode: 'LYRICS_CONVERT_SUCCESS'
    });
    return cachedLyrics;
  } catch (error) {
    logger.debug('Failed to convert lyrics to romaja.', { error });
    sendMessageToRenderer({
      messageCode: 'LYRICS_CONVERT_FAILED'
    });
  }

  return undefined;
};

export default convertLyricsToRomaja;
