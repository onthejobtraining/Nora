import { getUserData, setUserData } from '../filesystem';
import logger from '../logger';
import { dataUpdateEvent } from '../main';

const clearSearchHistoryResults = (resultsToRemove = [] as string[]) => {
  logger.debug(
    `User request to remove ${
      resultsToRemove.length > 0 ? resultsToRemove.length : 'all'
    } results from the search history.`
  );
  const { recentSearches } = getUserData();
  if (Array.isArray(recentSearches)) {
    if (recentSearches.length === 0) return true;
    if (resultsToRemove.length === 0) setUserData('recentSearches', []);
    else {
      const updatedRecentSearches = recentSearches.filter(
        (recentSearch) => !resultsToRemove.some((result) => recentSearch === result)
      );
      setUserData('recentSearches', updatedRecentSearches);
    }
  }
  dataUpdateEvent('userData/recentSearches');
  logger.debug('Finished the cleaning process of the search history.');
  return true;
};

export default clearSearchHistoryResults;
