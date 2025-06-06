import { Playlist } from '../../PlaylistsPage/Playlist';
import useSelectAllHandler from '../../../hooks/useSelectAllHandler';
import SecondaryContainer from '../../SecondaryContainer';
import VirtualizedGrid from '../../VirtualizedGrid';
import { useStore } from '@tanstack/react-store';
import { store } from '@renderer/store';

type Props = { playlistData: Playlist[] };
const MIN_ITEM_WIDTH = 175;
const MIN_ITEM_HEIGHT = 220;

const AllPlaylistResults = (prop: Props) => {
  const currentlyActivePage = useStore(store, (state) => state.currentlyActivePage);
  const { playlistData } = prop;

  const selectAllHandler = useSelectAllHandler(playlistData, 'playlist', 'playlistId');

  return (
    <SecondaryContainer
      className="playlists-container flex h-full flex-wrap"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      {playlistData && playlistData.length > 0 && (
        <VirtualizedGrid
          data={playlistData}
          fixedItemWidth={MIN_ITEM_WIDTH}
          fixedItemHeight={MIN_ITEM_HEIGHT}
          scrollTopOffset={currentlyActivePage.data?.scrollTopOffset}
          itemContent={(index, playlist) => {
            return <Playlist index={index} selectAllHandler={selectAllHandler} {...playlist} />;
          }}
        />
      )}
    </SecondaryContainer>
  );
};

export default AllPlaylistResults;
