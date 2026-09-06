import { useEffect, useState } from 'react'
import './App.css'
import { Feed } from './Feed'

type Theme = 'light' | 'dark'
type Locale = 'en' | 'vi'

const copy = {
  en: {
    brand: 'TechBrief',
    title: 'Today’s technology brief',
    subtitle: 'Trusted technology stories, thoughtfully selected.',
    switchTheme: 'Switch theme',
    switchLanguage: 'Chuyển sang tiếng Việt',
    light: 'Light',
    dark: 'Dark',
  },
  vi: {
    brand: 'TechBrief',
    title: 'Điểm tin công nghệ hôm nay',
    subtitle: 'Các câu chuyện công nghệ đáng tin cậy, được chọn lọc.',
    switchTheme: 'Đổi giao diện',
    switchLanguage: 'Switch to English',
    light: 'Sáng',
    dark: 'Tối',
  },
} as const

function getPreferredTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme)
  const [locale, setLocale] = useState<Locale>('en')
  const text = copy[locale]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const nextLocale = locale === 'en' ? 'vi' : 'en'

  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label={text.brand}>
          <span className="brand-mark" aria-hidden="true">T</span>
          {text.brand}
        </a>

        <div className="masthead-actions">
          <button
            type="button"
            className="preference-button"
            aria-label={text.switchTheme}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(nextTheme)}
          >
            <span aria-hidden="true">{theme === 'light' ? '☀' : '☾'}</span>
            {theme === 'light' ? text.light : text.dark}
          </button>
          <button
            type="button"
            className="preference-button"
            aria-label={text.switchLanguage}
            onClick={() => setLocale(nextLocale)}
          >
            {locale === 'en' ? 'VI' : 'EN'}
          </button>
        </div>
      </header>

      <section className="brief-intro" aria-labelledby="brief-title">
        <p className="eyebrow">{text.brand}</p>
        <h1 id="brief-title">{text.title}</h1>
        <p>{text.subtitle}</p>
      </section>
      <Feed locale={locale} />
    </main>
  )
}

export default App
