// electron-builder afterSign hook. Notarizes the macOS app only when Apple
// credentials are present in the environment; otherwise it cleanly skips so
// unsigned local/CI builds still succeed.
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('• skipping notarization — Apple credentials not set')
    return
  }

  const appName = context.packager.appInfo.productFilename
  console.log(`• notarizing ${appName}.app`)
  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  })
}
