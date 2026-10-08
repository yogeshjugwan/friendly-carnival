/** Country landing pages for search (/chat/<slug>). */
export interface CountryPage {
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  code: string;
  greeting: string;
  languages: string;
  /** Something people there like to talk about. */
  topics: string;
}

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://call-random-call.vercel.app').replace(/\/$/, '');

export const COUNTRY_PAGES: CountryPage[] = [
  { slug: 'india', name: 'India', code: 'IN', greeting: 'Namaste', languages: 'Hindi, English, Tamil, Telugu, Bengali and more', topics: 'cricket, Bollywood and chai' },
  { slug: 'pakistan', name: 'Pakistan', code: 'PK', greeting: 'Assalam-o-Alaikum', languages: 'Urdu, English and Punjabi', topics: 'cricket, food and music' },
  { slug: 'bangladesh', name: 'Bangladesh', code: 'BD', greeting: 'Nomoskar', languages: 'Bengali and English', topics: 'cricket, music and movies' },
  { slug: 'nepal', name: 'Nepal', code: 'NP', greeting: 'Namaste', languages: 'Nepali and English', topics: 'trekking, music and football' },
  { slug: 'sri-lanka', name: 'Sri Lanka', code: 'LK', greeting: 'Ayubowan', languages: 'Sinhala, Tamil and English', topics: 'cricket, beaches and food' },
  { slug: 'indonesia', name: 'Indonesia', code: 'ID', greeting: 'Halo', languages: 'Bahasa Indonesia and English', topics: 'K-pop, football and travel' },
  { slug: 'philippines', name: 'Philippines', code: 'PH', greeting: 'Kumusta', languages: 'Filipino and English', topics: 'basketball, karaoke and food' },
  { slug: 'malaysia', name: 'Malaysia', code: 'MY', greeting: 'Apa khabar', languages: 'Malay, English and Chinese', topics: 'food, football and travel' },
  { slug: 'usa', name: 'the United States', code: 'US', greeting: 'Hey', languages: 'English and Spanish', topics: 'sports, movies and music' },
  { slug: 'uk', name: 'the United Kingdom', code: 'GB', greeting: 'Hiya', languages: 'English', topics: 'football, music and TV' },
  { slug: 'canada', name: 'Canada', code: 'CA', greeting: 'Hey', languages: 'English and French', topics: 'hockey, travel and music' },
  { slug: 'australia', name: 'Australia', code: 'AU', greeting: "G'day", languages: 'English', topics: 'beaches, sport and music' },
  { slug: 'uae', name: 'the UAE', code: 'AE', greeting: 'Marhaba', languages: 'Arabic, English, Hindi and Urdu', topics: 'travel, cars and food' },
  { slug: 'saudi-arabia', name: 'Saudi Arabia', code: 'SA', greeting: 'Marhaba', languages: 'Arabic and English', topics: 'football, gaming and travel' },
  { slug: 'brazil', name: 'Brazil', code: 'BR', greeting: 'Oi', languages: 'Portuguese and English', topics: 'football, music and beaches' },
  { slug: 'mexico', name: 'Mexico', code: 'MX', greeting: 'Hola', languages: 'Spanish and English', topics: 'football, food and music' },
  { slug: 'spain', name: 'Spain', code: 'ES', greeting: 'Hola', languages: 'Spanish and English', topics: 'football, travel and music' },
  { slug: 'france', name: 'France', code: 'FR', greeting: 'Salut', languages: 'French and English', topics: 'food, football and films' },
  { slug: 'germany', name: 'Germany', code: 'DE', greeting: 'Hallo', languages: 'German and English', topics: 'football, music and travel' },
  { slug: 'turkey', name: 'Türkiye', code: 'TR', greeting: 'Merhaba', languages: 'Turkish and English', topics: 'football, series and food' },
  { slug: 'egypt', name: 'Egypt', code: 'EG', greeting: 'Ahlan', languages: 'Arabic and English', topics: 'football, movies and history' },
  { slug: 'nigeria', name: 'Nigeria', code: 'NG', greeting: 'How far', languages: 'English, Yoruba, Igbo and Hausa', topics: 'Afrobeats, football and Nollywood' },
];

export const countryPage = (slug: string) => COUNTRY_PAGES.find((c) => c.slug === slug);
