// FEATURE/ENVIRONMENT DETECTION
/**
 * Detect browser environment
 */
export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * Detect mobile device
 */
export const isMobile = (): boolean => {
  if (!isBrowser()) return false

  const userAgent = navigator.userAgent

  // Standard mobile OS and browser detection
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return true
  }

  // Chinese mobile devices
  if (/Huawei|HUAWEI|Honor|HONOR|Xiaomi|MI\/|Redmi|POCO|OPPO|vivo|OnePlus|Realme/i.test(userAgent)) {
    return true
  }

  // Korean mobile devices
  if (/Samsung|SAMSUNG|LG|Tizen/i.test(userAgent)) {
    return true
  }

  // Japanese mobile devices
  if (/Sony|SONY|Xperia|Sharp|SHARP|Fujitsu|FOMA|KDDI/i.test(userAgent)) {
    return true
  }

  // Russian mobile devices
  if (/Yandex.Phone|YandexPhone|BQ-|BQru/i.test(userAgent)) {
    return true
  }

  // Other mobile platforms
  if (
    /Windows Phone|WindowsPhone|Lumia|Mobile|Tablet|Phone|WPDesktop|ZuneWP|WP7|wds|Fennec|Firefox OS|KaiOS|KAIOS|Sailfish/i.test(
      userAgent,
    )
  ) {
    return true
  }

  // Mobile browser detection
  if (/Mobile|Tablet|Android|Touch/i.test(userAgent) && !/Windows NT|Mac OS X/i.test(userAgent)) {
    return true
  }

  // Feature detection for touch devices (most mobile devices have touch capability)
  if (isBrowser() && ("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
    // Additional check to avoid false positives on desktops with touch screens
    if (window.innerWidth <= 1024 || /Mobi|Android/i.test(userAgent)) {
      return true
    }
  }

  return false
}

/**
 * Detect specific browser
 */
export const getBrowser = (): { name: string; version: string } => {
  if (!isBrowser()) return { name: "unknown", version: "0" }

  const ua = navigator.userAgent
  let browserName = "unknown"
  let version = "0"

  // Order matters here - we need to check more specific browsers first
  // before falling back to more generic ones

  // --- Chinese Browsers ---
  if (/MicroMessenger|WeChat/.test(ua)) {
    browserName = "wechat"
    const match = ua.match(/MicroMessenger\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // QQ Browser
  else if (/QQBrowser/.test(ua)) {
    browserName = "qq"
    const match = ua.match(/QQBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // UC Browser
  else if (/UCBrowser/.test(ua)) {
    browserName = "uc"
    const match = ua.match(/UCBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Baidu Browser
  else if (/Baidu|BIDUBrowser|baiduboxapp/.test(ua)) {
    browserName = "baidu"
    const match = ua.match(/(?:Baidu|BIDUBOX)(?:Browser)?\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Mi Browser
  else if (/MiuiBrowser/.test(ua)) {
    browserName = "mi"
    const match = ua.match(/MiuiBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Russian Browsers ---
  // Yandex Browser
  else if (/YaBrowser/.test(ua)) {
    browserName = "yandex"
    const match = ua.match(/YaBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Korean Browsers ---
  // Naver Whale
  else if (/Whale/.test(ua)) {
    browserName = "whale"
    const match = ua.match(/Whale\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Mobile Browsers ---
  // Samsung Internet
  else if (/SamsungBrowser/.test(ua)) {
    browserName = "samsung"
    const match = ua.match(/SamsungBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Huawei Browser
  else if (/HuaweiBrowser/.test(ua)) {
    browserName = "huawei"
    const match = ua.match(/HuaweiBrowser\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Alternative Browsers ---
  // Vivaldi
  else if (/Vivaldi/.test(ua)) {
    browserName = "vivaldi"
    const match = ua.match(/Vivaldi\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Lunascape
  else if (/Lunascape/.test(ua)) {
    browserName = "lunascape"
    const match = ua.match(/Lunascape[/| ](\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Opera
  else if (/OPR|Opera/.test(ua)) {
    browserName = "opera"
    const match = ua.match(/(?:OPR|Opera)[/| ](\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Emulators ---
  // Nox Browser/Emulator
  else if (/Nox/.test(ua)) {
    browserName = "nox"
    const match = ua.match(/Nox\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // BlueStacks
  else if (/BlueStacks/.test(ua)) {
    browserName = "bluestacks"
    const match = ua.match(/BlueStacks\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  // --- Major Browsers (keep these last as fallbacks) ---
  // Edge
  else if (/Edg/.test(ua)) {
    browserName = "edge"
    const match = ua.match(/Edg\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Chrome
  else if (/Chrome/.test(ua) && !/Chromium|Edge|Edg|OPR|Opera/.test(ua)) {
    browserName = "chrome"
    const match = ua.match(/Chrome\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Firefox
  else if (/Firefox/.test(ua)) {
    browserName = "firefox"
    const match = ua.match(/Firefox\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Safari
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browserName = "safari"
    const match = ua.match(/Version\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // IE
  else if (/Trident|MSIE/.test(ua)) {
    browserName = "ie"
    const match = ua.match(/(?:rv:|MSIE )(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }
  // Chromium-based browsers not caught above
  else if (/Chromium/.test(ua)) {
    browserName = "chromium"
    const match = ua.match(/Chromium\/(\d+\.\d+)/)
    version = match ? match[1] : "0"
  }

  return { name: browserName, version }
}

/**
 * Detect operating system
 */
export const getOS = (): { name: "mac" | "linux" | "windows" | "unknown" } => {
  if (!isBrowser()) return { name: "unknown" }

  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()

  // macOS and iOS devices
  if (
    platform.includes("mac") ||
    platform.includes("ipad") ||
    platform.includes("ipod") ||
    platform.includes("iphone") ||
    userAgent.includes("mac") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    (userAgent.includes("safari") && !userAgent.includes("chrome") && !userAgent.includes("android"))
  ) {
    return { name: "mac" }
  }
  // Windows detection
  else if (platform.includes("win") || userAgent.includes("win") || userAgent.includes("windows nt")) {
    return { name: "windows" }
  }
  // Linux and Linux-based OS detection
  else if (
    // Standard Linux
    platform.includes("linux") ||
    userAgent.includes("linux") ||
    // Android (Linux-based)
    userAgent.includes("android") ||
    // Chinese OS (most are Linux-based)
    userAgent.includes("harmonyos") ||
    userAgent.includes("deepin") ||
    userAgent.includes("uos") ||
    userAgent.includes("cos") ||
    // Russian Linux distributions
    userAgent.includes("astra linux") ||
    userAgent.includes("alt linux") ||
    userAgent.includes("rosa") ||
    // Korean OS
    userAgent.includes("tizen") ||
    userAgent.includes("gooroom") ||
    // Other Linux-based OS
    userAgent.includes("ubuntu") ||
    userAgent.includes("debian") ||
    userAgent.includes("fedora") ||
    userAgent.includes("red hat") ||
    userAgent.includes("suse") ||
    userAgent.includes("mint") ||
    // Chrome OS (Linux-based)
    userAgent.includes("cros") ||
    userAgent.includes("chromium os") ||
    userAgent.includes("chrome os") ||
    // BSD variants (Unix-like, grouped with Linux for simplicity)
    userAgent.includes("freebsd") ||
    userAgent.includes("openbsd") ||
    userAgent.includes("netbsd")
  ) {
    return { name: "linux" }
  }

  // Fallback for undetected OS
  return { name: "unknown" }
}

/**
 * Check if print is supported
 */
export const isPrintSupported = (): boolean => {
  return isBrowser() && typeof window.print === 'function';
};

/**
 * Check if beforeprint event is supported
 */
export const isBeforePrintSupported = (): boolean => {
  if (!isBrowser()) return false;
  
  const mediaQueryList = window.matchMedia('print');
  return !!mediaQueryList.addListener || 'onbeforeprint' in window;
};