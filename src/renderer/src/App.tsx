import Overlay from './overlay/Overlay'
import Recorder from './recorder/Recorder'
import Studio from './studio/Studio'
import FloatBar from './floatbar/FloatBar'
import Settings from './settings/Settings'

/**
 * The same renderer bundle serves several windows; the URL hash picks which.
 *   #/overlay → region selector   #/recorder → record bar   #/studio → library + editor
 *   #/floatbar → floating launcher   #/settings → preferences
 */
export default function App(): JSX.Element {
  // Tolerate both "#/overlay" (dev loadURL) and "#overlay" (packaged loadFile).
  const route = window.location.hash.replace(/^#\/?/, '')
  if (route === 'overlay') return <Overlay />
  if (route === 'recorder') return <Recorder />
  if (route === 'floatbar') return <FloatBar />
  if (route === 'settings') return <Settings />
  return <Studio />
}
