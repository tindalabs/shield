import { ContentProtectionOptions, ContentProtector } from 'content-security-toolkit'

const primaryColor = '#1e88e5'
const protectedContent = document.getElementById('protected-content') || document.body

const options: ContentProtectionOptions = {
  targetElement: protectedContent, // WILL TARGET THE WHOLE PAGE IF #protected-content IS NOT FOUND IN THE DOCUMENT
  preventSelection: false,
  preventContextMenu: true,
  contextMenuOptions: {
    observeForIframes: true,
  },
  preventPrinting: true,
  preventKeyboardShortcuts: true,
  preventDevTools: true,
  devToolsOptions: {
    showOverlay: true,
    overlayOptions: {
      title: 'Developer Tools Detected',
      message: 'For security reasons, this content is not available while developer tools are open.',
      secondaryMessage: 'Please close the developer tools to continue viewing this content.',
      textColor: 'white',
      backgroundColor: primaryColor,
    },
    hideContent: true,
    checkFrequency: 1000,
  },
  preventScreenshots: true,
  screenshotOptions: {
    showOverlay: true,
    overlayOptions: {
      title: 'Screenshot Detected',
      message: 'For security reasons, capturing screenshots of this content is not allowed.',
      textColor: 'white',
      backgroundColor: primaryColor,
      fontSize: '48px',
      duration: 1000,
    },
    hideContent: true,
    preventFullscreen: true,
    fullscreenMessage: 'Fullscreen mode is disabled for security reasons',
  },
  enableWatermark: false,
  watermarkOptions: {
    text: 'CONFIDENTIAL',
    userId: 'user-123',
    opacity: 0.3,
    density: 2,
  },
  preventExtensions: false,
  extensionOptions: {
    detectionInterval: 2000,
    showOverlay: true,
    overlayOptions: {
      title: 'Content Protection Active',
      message: 'Please disable content scraping extensions to view this content.',
      backgroundColor: primaryColor,
      textColor: 'white',
    },
    hideContent: true,
  },
  preventEmbedding: false,
  frameEmbeddingOptions: {
    showOverlay: true,
    overlayOptions: {
      title: 'Embedding Not Allowed',
      message: 'This content cannot be displayed in an embedded frame.',
      secondaryMessage: 'Please visit the original website to view this content.',
      textColor: 'white',
      backgroundColor: primaryColor,
    },
    hideContent: true,
    allowedDomains: [],
    blockAllFrames: true,
  },
  debugMode: true,
  customHandlers: {
    onPrintAttempt: (event) => {
      console.log('Print attempt detected:', event)
    },
    onContextMenuAttempt: (event) => {
      console.log('Context menu attempt detected', event)
    },
    onSelectionAttempt: (event) => {
      console.log('Selection attempt detected', event)
    },
    onKeyboardShortcutBlocked: (event) => {
      console.log('Keyboard shortcut blocked', event.key)
    },
    onDevToolsOpen: (isOpen) => {
      console.log(`DevTools is ${isOpen ? 'open' : 'closed'}`)
    },
    onContentHidden: (reason, targetElement) => {
      console.log(`Content hidden: ${targetElement}, ${reason}`)
    },
    onContentRestored: (targetElement) => {
      console.log(`Content restored: ${targetElement}`)
      window.location.reload()
    },
    onScreenshotAttempt: (event) => {
      console.log('Screenshot attempt detected', event)
    },
    onExtensionDetected: (extensionId, extensionName, riskLevel) => {
      console.log('Extension detected', { extensionId, extensionName, riskLevel })
    },
    onFrameEmbeddingDetected: (isEmbedded, isExternalFrame) => {
      console.log('Frame embedding detected', { isEmbedded, isExternalFrame })
    },
  },
}

// CREATE PROTECTOR AND APPLY PROTECTIONS
const protector = new ContentProtector(options)
protector.protect()
