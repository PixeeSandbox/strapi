import { uploadApi } from './api';

import type { GetFiles, File, Pagination } from '../../../../shared/contracts/files';

interface GetAssetsParams {
  page?: number;
  pageSize?: number;
  folder?: number | null;
  sort?: string;
}

interface GetAssetsResponse {
  results: File[];
  pagination: Pagination;
}

const assetsApi = uploadApi.injectEndpoints({
  endpoints: (builder) => ({
    getAssets: builder.query<GetAssetsResponse, GetAssetsParams | void>({
      query: (params = {}) => ({
        url: '/upload/files',
        method: 'GET',
        config: { params },
      }),
      transformResponse: (response: GetFiles.Response['data']) => response,
      providesTags: (result) =>
        result
          ? [
              ...result.results.map(({ id }) => ({ type: 'Asset' as const, id })),
              { type: 'Asset', id: 'LIST' },
            ]
          : [{ type: 'Asset', id: 'LIST' }],
    }),
    getAsset: builder.query<File, number>({
      query: (id) => ({
        url: `/upload/files/${id}`,
        method: 'GET',
      }),
      providesTags: (_result, _error, id) => [{ type: 'Asset' as const, id }],
    }),
  }),
});

export const { useGetAssetsQuery, useGetAssetQuery } = assetsApi;
