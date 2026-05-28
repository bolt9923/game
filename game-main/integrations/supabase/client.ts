// Supabase stub – real-time room features use Firebase (src/lib/rooms.ts).
// This file exists so the build doesn't fail; supabase calls here are no-ops.

const noop = () => ({
  from: () => ({
    insert: async () => ({ error: null }),
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
    delete: () => ({
      eq: async () => ({ error: null }),
    }),
  }),
});

export const supabase = {
  from: (_table: string) => ({
    insert: async (_row: any) => ({ error: null }),
    select: (_cols: string) => ({
      eq: (_col: string, _val: any) => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
    delete: () => ({
      eq: async (_col: string, _val: any) => ({ error: null }),
    }),
  }),
  channel: (_name: string) => ({
    on: (..._args: any[]) => ({ subscribe: () => {} }),
    subscribe: () => {},
    unsubscribe: () => {},
  }),
  removeChannel: (_ch: any) => {},
};
