import { reactive } from 'vue'

const DISMISS_MS = 3000

const state = reactive({
  message: null as string | null,
})

let dismissTimeout: ReturnType<typeof setTimeout> | undefined

// A single active toast slot — showing a new toast replaces whatever's
// currently displayed, rather than queueing.
function show(message: string) {
  state.message = message
  clearTimeout(dismissTimeout)
  dismissTimeout = setTimeout(dismiss, DISMISS_MS)
}

function dismiss() {
  state.message = null
  clearTimeout(dismissTimeout)
}

export const toastStore = { state, show, dismiss }
