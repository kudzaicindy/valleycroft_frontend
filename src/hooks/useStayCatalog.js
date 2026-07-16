import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRooms, getRoomsPublicMedia } from '@/api/rooms';
import { FARM_STAYS, apiRowMatchesStay } from '@/content/farmStays';
import {
  isLandingStayCatalogRoom,
  mergeLandingCatalogRows,
  normalizePublicRoomsPayload,
} from '@/utils/publicRoomCatalog';
import { resolveRoomImageUrls } from '@/utils/roomImageUrl';
import { landingPriceLabelFromApi, roomPricePerNight } from '@/utils/roomPricing';

const HOUSE_IMAGES = [FARM_STAYS[0].images, FARM_STAYS[1].images, FARM_STAYS[2].images];

function buildMetaLine(stay) {
  if (!stay) return '';
  const parts = [stay.bedsShort, 'self-catering', ...stay.tags.filter((t) => t !== 'Farm breakfast')];
  return parts.join(', ');
}

function mapStayRow(apiRow, stay, idx, fallbackImgs) {
  const gallery = resolveRoomImageUrls(apiRow?.images || []).length
    ? resolveRoomImageUrls(apiRow.images || [])
    : resolveRoomImageUrls(fallbackImgs);
  const nightly = apiRow ? roomPricePerNight(apiRow) : stay?.price || 0;
  return {
    roomId: String(apiRow?._id ?? apiRow?.id ?? stay?.slug ?? idx),
    slug: stay?.slug || `house-${idx + 1}`,
    name: String(apiRow?.name || stay?.name || 'Room').trim(),
    metaLine: buildMetaLine(stay),
    desc: stay?.desc || '',
    price: apiRow ? landingPriceLabelFromApi(apiRow) : `R ${stay.price.toLocaleString('en-ZA')}`,
    nightly,
    img: gallery[0] || fallbackImgs[0],
    gallery,
  };
}

/**
 * Merged farm-stay catalog rows for public marketing (landing + stays page).
 */
export default function useStayCatalog() {
  const { data: catalogMediaRaw } = useQuery({
    queryKey: ['landing-room-catalog-media'],
    queryFn: () => getRoomsPublicMedia(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: catalogDetailRaw } = useQuery({
    queryKey: ['landing-room-catalog-detail'],
    queryFn: () => getRooms(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const catalogApiRooms = useMemo(() => {
    const mediaList = normalizePublicRoomsPayload(catalogMediaRaw);
    const detailList = normalizePublicRoomsPayload(catalogDetailRaw);
    const merged = mergeLandingCatalogRows(mediaList, detailList).filter(isLandingStayCatalogRoom);
    return [...merged].sort((a, b) => {
      const na = Number.isFinite(Number(a.order)) ? Number(a.order) : 999;
      const nb = Number.isFinite(Number(b.order)) ? Number(b.order) : 999;
      if (na !== nb) return na - nb;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [catalogMediaRaw, catalogDetailRaw]);

  const stays = useMemo(() => {
    if (catalogApiRooms.length > 0) {
      return catalogApiRooms.map((apiRow, idx) => {
        const stay = FARM_STAYS.find((s) => apiRowMatchesStay(apiRow, s));
        const stayIdx = stay ? FARM_STAYS.indexOf(stay) : idx;
        const fallbackImgs = HOUSE_IMAGES[stayIdx] || HOUSE_IMAGES[0];
        return mapStayRow(apiRow, stay, idx, fallbackImgs);
      });
    }
    return FARM_STAYS.map((stay, idx) => {
      const apiRoom = catalogApiRooms.find((row) => apiRowMatchesStay(row, stay));
      return mapStayRow(apiRoom, stay, idx, HOUSE_IMAGES[idx]);
    });
  }, [catalogApiRooms]);

  return { stays };
}
