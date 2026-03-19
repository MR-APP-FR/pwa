'use client';

import { useQuery } from '@tanstack/react-query';
import {
  MOCK_CURRENT_USER,
  MOCK_CURRENT_USER_INFO,
  MOCK_CURRENT_USER_INFO_SITES,
} from '../../database/mock/users.mock';

const MOCK_DATA = {
  user: MOCK_CURRENT_USER,
  userInfo: MOCK_CURRENT_USER_INFO,
  sites: MOCK_CURRENT_USER_INFO_SITES,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => MOCK_DATA,
    initialData: MOCK_DATA,
  });
}
