import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'

export interface GitFileItem {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied' | 'typechange'
  statusCode: string
  oldPath?: string
  isStaged: boolean
}

export const useGitStore = defineStore('gitStore', () => {
  const workspaceStore = useWorkspaceStore()

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

  async function discardFile(file: GitFileItem): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitDiscard) return
    try {
      await window.makaryaAPI.gitDiscard(root, file.path, file.status === 'untracked')
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
      const suggested = await window.makaryaAPI.gitGenerateCommitMsg(root)
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

  async function openFileDiff(file: GitFileItem, isStaged = false): Promise<void> {
    const root = getProjectRoot()
    if (!root || !window.makaryaAPI?.gitGetDiff) return

    try {
      const fullPath = root.endsWith('\\') || root.endsWith('/') ? `${root}${file.path}` : `${root}/${file.path}`
      const diffData = await window.makaryaAPI.gitGetDiff(root, file.path, isStaged)

      // Open tab in editor
      await workspaceStore.openFile(fullPath, file.path.split(/[\\/]/).pop() || file.path)

      // Register pending diff in workspaceStore so Monaco displays the Antigravity diff review
      if (diffData.originalContent !== diffData.newContent) {
        workspaceStore.setPendingDiff(fullPath, diffData.originalContent, diffData.newContent)
      }
    } catch (err) {
      console.warn('[GitStore] Error opening file diff:', err)
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
    openFileDiff
  }
})
