import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { useSettingsStore } from './settingsStore'
import { detectMonacoLanguage } from '@renderer/utils/languageDetector'

export interface GitFileItem {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied' | 'typechange'
  statusCode: string
  oldPath?: string
  isStaged: boolean
}

export interface GitDiffModalState {
  isOpen: boolean
  file: GitFileItem | null
  isStaged: boolean
  originalContent: string
  newContent: string
  language: string
  fullPath: string
}

export const useGitStore = defineStore('gitStore', () => {
  const workspaceStore = useWorkspaceStore()
  const settingsStore = useSettingsStore()

  const isGitRepo = ref<boolean>(false)
  const branch = ref<string>('main')
  const ahead = ref<number>(0)
  const behind = ref<number>(0)
  const staged = ref<GitFileItem[]>([])
  const unstaged = ref<GitFileItem[]>([])
  const untracked = ref<GitFileItem[]>([])
  const commitMessage = ref<string>('')

  const isLoadingStatus = ref<boolean>(false)
  const isCommitting = ref<boolean>(false)
  const isGeneratingMessage = ref<boolean>(false)
  const isPushing = ref<boolean>(false)
  const isPulling = ref<boolean>(false)

  const totalChanges = computed(() => {
    return staged.value.length + unstaged.value.length + untracked.value.length
  })

  const hasStagedChanges = computed(() => staged.value.length > 0)
  const hasUnstagedChanges = computed(() => unstaged.value.length > 0 || untracked.value.length > 0)

  function getProjectRoot(): string | undefined {
    return (
      workspaceStore.activeRootPath ||
      (workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)
    )
  }

  async function refreshStatus(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitGetStatus) {
      isGitRepo.value = false
      staged.value = []
      unstaged.value = []
      untracked.value = []
      return
    }

    isLoadingStatus.value = true
    try {
      const res = await window.makaryaAPI.gitGetStatus(root)
      isGitRepo.value = res.isGitRepo
      branch.value = res.branch || 'main'
      ahead.value = res.ahead || 0
      behind.value = res.behind || 0
      staged.value = (res.staged || []) as GitFileItem[]
      unstaged.value = (res.unstaged || []) as GitFileItem[]
      untracked.value = (res.untracked || []) as GitFileItem[]
    } catch (err) {
      console.warn('[GitStore] Error refreshing git status:', err)
      isGitRepo.value = false
    } finally {
      isLoadingStatus.value = false
    }
  }

  async function stageFile(filePath: string): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitStage) return
    try {
      await window.makaryaAPI.gitStage(root, filePath)
      await refreshStatus()
    } catch (err) {
      console.warn('[GitStore] Error staging file:', err)
    }
  }

  async function stageAll(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitStageAll) return
    try {
      await window.makaryaAPI.gitStageAll(root)
      await refreshStatus()
    } catch (err) {
      console.warn('[GitStore] Error staging all:', err)
    }
  }

  async function unstageFile(filePath: string): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitUnstage) return
    try {
      await window.makaryaAPI.gitUnstage(root, filePath)
      await refreshStatus()
    } catch (err) {
      console.warn('[GitStore] Error unstaging file:', err)
    }
  }

  async function unstageAll(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitUnstageAll) return
    try {
      await window.makaryaAPI.gitUnstageAll(root)
      await refreshStatus()
    } catch (err) {
      console.warn('[GitStore] Error unstaging all:', err)
    }
  }

  async function discardFile(file: GitFileItem | string): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitDiscard) return
    const filePath = typeof file === 'string' ? file : file.path
    const isUntracked = typeof file === 'string' ? false : file.status === 'untracked'
    try {
      await window.makaryaAPI.gitDiscard(root, filePath, isUntracked)
      await refreshStatus()
      workspaceStore.refreshFileTree()
    } catch (err) {
      console.warn('[GitStore] Error discarding file:', err)
    }
  }

  async function discardAll(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitDiscardAll) return
    try {
      await window.makaryaAPI.gitDiscardAll(root)
      await refreshStatus()
      workspaceStore.refreshFileTree()
    } catch (err) {
      console.warn('[GitStore] Error discarding all:', err)
    }
  }

  async function commit(): Promise<boolean> {
    const root = getProjectRoot()
    const msg = commitMessage.value.trim()
    if (!root || !msg || !window.makaryaAPI?.gitCommit) return false

    // If nothing staged but has unstaged changes, auto-stage all
    if (staged.value.length === 0 && (unstaged.value.length > 0 || untracked.value.length > 0)) {
      await stageAll()
    }

    isCommitting.value = true
    try {
      const res = await window.makaryaAPI.gitCommit(root, msg)
      if (res.success) {
        commitMessage.value = ''
        await refreshStatus()
        return true
      }
      return false
    } catch (err) {
      console.warn('[GitStore] Error committing:', err)
      return false
    } finally {
      isCommitting.value = false
    }
  }

  async function generateCommitMessage(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitGenerateCommitMsg) return

    isGeneratingMessage.value = true
    try {
      const model = settingsStore.ai?.defaultModel || ''
      const customConfig = {
        baseUrl: settingsStore.ai?.baseUrl,
        apiKey: settingsStore.ai?.apiKey
      }
      const suggested = await window.makaryaAPI.gitGenerateCommitMsg(root, model, customConfig)
      if (suggested) {
        commitMessage.value = suggested
      }
    } catch (err) {
      console.warn('[GitStore] Error generating AI commit message:', err)
    } finally {
      isGeneratingMessage.value = false
    }
  }

  async function push(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitPush) return

    isPushing.value = true
    try {
      await window.makaryaAPI.gitPush(root)
      await refreshStatus()
    } catch (err) {
      console.warn('[GitStore] Error pushing:', err)
    } finally {
      isPushing.value = false
    }
  }

  async function pull(): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitPull) return

    isPulling.value = true
    try {
      await window.makaryaAPI.gitPull(root)
      await refreshStatus()
      workspaceStore.refreshFileTree()
    } catch (err) {
      console.warn('[GitStore] Error pulling:', err)
    } finally {
      isPulling.value = false
    }
  }

  const diffModal = ref<GitDiffModalState>({
    isOpen: false,
    file: null,
    isStaged: false,
    originalContent: '',
    newContent: '',
    language: 'plaintext',
    fullPath: ''
  })

  function closeDiffModal(): void {
    diffModal.value.isOpen = false
    diffModal.value.file = null
  }

  // Combined list of changed files for modal navigation
  const allChangedFiles = computed<Array<{ file: GitFileItem; isStaged: boolean }>>(() => {
    const list: Array<{ file: GitFileItem; isStaged: boolean }> = []
    staged.value.forEach((f) => list.push({ file: f, isStaged: true }))
    unstaged.value.forEach((f) => list.push({ file: f, isStaged: false }))
    untracked.value.forEach((f) => list.push({ file: f, isStaged: false }))
    return list
  })

  const currentDiffIndex = computed<number>(() => {
    if (!diffModal.value.file) return -1
    return allChangedFiles.value.findIndex(
      (item) => item.file.path === diffModal.value.file?.path && item.isStaged === diffModal.value.isStaged
    )
  })

  async function nextDiffFile(): Promise<void> {
    const list = allChangedFiles.value
    if (list.length <= 1) return
    const nextIdx = (currentDiffIndex.value + 1) % list.length
    const nextItem = list[nextIdx]
    await openFileDiff(nextItem.file, nextItem.isStaged)
  }

  async function prevDiffFile(): Promise<void> {
    const list = allChangedFiles.value
    if (list.length <= 1) return
    const prevIdx = (currentDiffIndex.value - 1 + list.length) % list.length
    const prevItem = list[prevIdx]
    await openFileDiff(prevItem.file, prevItem.isStaged)
  }

  async function openFileDiff(file: GitFileItem, isStaged = false): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitGetDiff) return

    try {
      const fullPath = root.endsWith('\\') || root.endsWith('/') ? `${root}${file.path}` : `${root}/${file.path}`
      const diffData = await window.makaryaAPI.gitGetDiff(root, file.path, isStaged)
      const language = detectMonacoLanguage(file.path)

      diffModal.value = {
        isOpen: true,
        file,
        isStaged,
        originalContent: diffData.originalContent || '',
        newContent: diffData.newContent || '',
        language,
        fullPath
      }
    } catch (err) {
      console.warn('[GitStore] Error opening file diff modal:', err)
    }
  }

  return {
    isGitRepo,
    branch,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    commitMessage,
    totalChanges,
    hasStagedChanges,
    hasUnstagedChanges,
    isLoadingStatus,
    isCommitting,
    isGeneratingMessage,
    isPushing,
    isPulling,
    diffModal,
    allChangedFiles,
    currentDiffIndex,
    refreshStatus,
    stageFile,
    stageAll,
    unstageFile,
    unstageAll,
    discardFile,
    discardAll,
    commit,
    generateCommitMessage,
    push,
    pull,
    openFileDiff,
    closeDiffModal,
    nextDiffFile,
    prevDiffFile
  }
})
