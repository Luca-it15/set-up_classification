export const DEFAULT_SETTINGS = {
  version: '1.0',
  initialized: false,
  workspace: {
    name: '',
    folders: [],
    excluded: ['node_modules', 'dist', '.git', 'coverage', '.cache'],
    type: 'project',
    purpose: '',
    path_policy: 'relative',
    analysis_level: 'deep',
    reference_tool: 'auto',
    include_chat_history: false
  },
  manual_components: [],
  viewer: { palette: 'dark' }
};
