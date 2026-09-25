export interface EditorTabItem {
  id: string
  title: string
  filePath?: string
  language: string
  isDirty?: boolean
  tabType: 'editor' | 'welcome'
}

export interface EditorModuleState {
  isSidebarOpen: boolean
  isTerminalOpen: boolean
}
