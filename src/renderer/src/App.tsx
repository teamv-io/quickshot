import Overlay from './overlay/Overlay'
import Editor from './editor/Editor'

/**
 * The same renderer bundle serves two windows; the URL hash picks which.
 *   #/overlay → region selector   #/editor → annotation editor
 */
export default function App(): JSX.Element {
  const route = window.location.hash.replace(/^#\//, '')
  if (route === 'overlay') return <Overlay />
  return <Editor />
}
