import Overlay from './overlay/Overlay'
import Editor from './editor/Editor'
import Recorder from './recorder/Recorder'
import VideoEditor from './video/VideoEditor'

/**
 * The same renderer bundle serves several windows; the URL hash picks which.
 *   #/overlay → region selector   #/editor → image editor
 *   #/recorder → record bar       #/video → recording review
 */
export default function App(): JSX.Element {
  const route = window.location.hash.replace(/^#\//, '')
  if (route === 'overlay') return <Overlay />
  if (route === 'recorder') return <Recorder />
  if (route === 'video') return <VideoEditor />
  return <Editor />
}
