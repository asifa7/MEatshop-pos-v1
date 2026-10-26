import React from 'react';

export interface AnimalIconProps {
  iconKey?: string;
  size?: number;
  className?: string;
}

export const ANIMAL_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'goat', label: 'Goat / Mutton' },
  { key: 'sheep', label: 'Sheep (Mutton)' },
  { key: 'chicken', label: 'Chicken (Broiler)' },
  { key: 'rooster', label: 'Country Chicken (Rooster)' },
  { key: 'turkey', label: 'Turkey' },
  { key: 'quail', label: 'Quail (Kaadai)' },
  { key: 'duck', label: 'Duck' },
  { key: 'rabbit', label: 'Rabbit' },
  { key: 'bird', label: 'Generic Bird' },
  { key: 'livestock', label: 'Generic Livestock' },
];

export const AnimalIcon: React.FC<AnimalIconProps> = ({
  iconKey = 'chicken',
  size = 18,
  className = '',
}) => {
  const normKey = (iconKey || '').toLowerCase().trim();

  switch (normKey) {
    case 'sheep':
      // Sheep SVG (Curled rams horns / woolly body)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Curled Ram Horn */}
          <path d="M7 6 C5 5 4 7 5 9 C6 10 8 10 8 8" />
          <path d="M8 8 L10 10 L8 12" />
          {/* Woolly head & body */}
          <path d="M10 8 C12 6 15 6 18 8 C20 10 21 13 20 16" />
          <path d="M20 16 L21 16" />
          <path d="M18 16 L18 21 L16 21 L16 16" />
          <path d="M16 16 C14 17 11 17 9 16 L9 21 L7 21 L7 12" />
          <circle cx="7.5" cy="8.5" r="0.7" fill="currentColor" />
        </svg>
      );

    case 'goat':
    case 'mutton':
      // Goat silhouette SVG
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Goat Horns & Head */}
          <path d="M7 3 C6 1 4 1 3 3 C2 5 4 6 5 7" />
          <path d="M9 4 C8 2 10 1 11 2" />
          {/* Head & Beard */}
          <path d="M5 7 L3 11 C4 12 5 12 6 11 L7 13 L8 11" />
          {/* Body */}
          <path d="M7 10 C10 10 13 9 17 11 C19 12 21 13 21 15" />
          {/* Back leg & tail */}
          <path d="M21 15 L22 14" />
          <path d="M19 15 L19 21 L17 21 L17 16" />
          {/* Belly & Front legs */}
          <path d="M17 16 C14 16 11 16 9 15 L9 21 L7 21 L7 13" />
          {/* Eye */}
          <circle cx="5.5" cy="8.5" r="0.7" fill="currentColor" />
        </svg>
      );

    case 'turkey':
      // Turkey SVG (Fan tail, snood, prominent breast)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Turkey Head & Snood */}
          <path d="M7 7 C6 6 5 7 5 8 C5 9 7 9 7 10 L6 11" />
          <circle cx="6.5" cy="7.5" r="0.6" fill="currentColor" />
          {/* Neck & Breast */}
          <path d="M7 10 C8 12 8 14 7 16" />
          {/* Turkey Fan Tail */}
          <path d="M13 11 C14 8 16 5 18 4 C19 7 21 10 21 13" />
          <path d="M15 10 C17 8 19 8 20 10" />
          <path d="M13 14 C16 14 18 16 19 18" />
          {/* Body & legs */}
          <path d="M7 16 C9 18 13 18 16 16" />
          <path d="M10 16 L10 21 L12 21" />
          <path d="M14 16 L14 21 L16 21" />
        </svg>
      );

    case 'rooster':
    case 'country_chicken':
      // Rooster / Country Chicken SVG (Comb, Wattle, Tail Plumes)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Rooster Comb */}
          <path d="M6 3 C6.5 2 7.5 2 8 3 C8.5 2 9.5 2 10 3.5 L9 5" />
          {/* Head & Beak */}
          <path d="M6 5 L4 7 L7 8" />
          {/* Wattle */}
          <path d="M6 8 C6 9.5 5 9.5 5 8.5" />
          {/* Neck & Breast */}
          <path d="M7 8 C8 11 8 13 7 16" />
          {/* Curved Back & Big Feathered Tail Plumes */}
          <path d="M9 5 C12 6 14 8 16 11 C18 10 20 8 21 5 C22 9 21 13 18 15" />
          <path d="M16 11 C18 13 19 15 17 17" />
          {/* Legs & Spurs */}
          <path d="M10 16 L9 21 L12 21" />
          <path d="M14 16 L14 21" />
          {/* Body Belly */}
          <path d="M7 16 C9 18 12 18 15 16" />
        </svg>
      );

    case 'chicken':
    case 'broiler':
      // Hen / Broiler Chicken SVG
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Small Hen comb */}
          <path d="M7 4 C8 3 9 4 9 5" />
          {/* Head and beak */}
          <path d="M7 5 L5 7 L8 8" />
          {/* Plump body */}
          <path d="M8 8 C11 7 15 9 17 12 C19 13 20 14 21 13 C21 15 19 17 17 17" />
          <path d="M8 8 C7 11 7 14 8 16 C10 18 14 18 17 17" />
          {/* Hen wing */}
          <path d="M11 11 C13 11 15 13 14 15 C13 16 11 15 10 13 Z" />
          {/* Feet */}
          <path d="M10 17 L10 21" />
          <path d="M14 17 L14 21" />
        </svg>
      );

    case 'quail':
    case 'quils':
      // Quail (Compact round bird with distinctive crest feather)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Quail Topknot / Crest Feather forward curve */}
          <path d="M9 3 C8 1.5 6 2 5 3 C6 4 7 4 8 5" />
          {/* Small rounded head & sharp beak */}
          <path d="M8 5 L6 7 L8 8" />
          {/* Very plump, rounded egg-shaped body */}
          <path d="M8 8 C6 11 7 16 11 17 C15 18 18 16 19 13 C20 11 19 9 17 8 C14 7 10 6 8 8 Z" />
          {/* Short tail feathers */}
          <path d="M19 13 L21 14 L18 15" />
          {/* Mottled wing stripe */}
          <path d="M11 11 C14 11 16 13 15 15" />
          {/* Short legs */}
          <path d="M11 17 L11 21" />
          <path d="M14 17 L14 21" />
        </svg>
      );

    case 'duck':
    case 'ducks':
      // Duck SVG (Flat bill, sleek waterbird body, turned-up tail)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Flat duck bill */}
          <path d="M4 8 C2 8 2 10 4 10 L7 10" />
          {/* Rounded head & curved neck */}
          <path d="M7 6 C8 4 10 5 11 7 C12 9 11 11 10 12" />
          {/* Oval floating/walking body */}
          <path d="M10 12 C13 11 17 11 20 13 C22 14 21 11 20 10 C21 13 20 16 17 17 C13 18 9 17 7 15 C6 13 7 12 10 12 Z" />
          {/* Webbed feet / legs */}
          <path d="M11 17 L10 21 L12 21" />
          <path d="M15 17 L15 21 L17 21" />
          {/* Eye */}
          <circle cx="9" cy="7" r="0.7" fill="currentColor" />
        </svg>
      );

    case 'rabbit':
    case 'hare':
      // Rabbit / Hare SVG (Long upright ears, fluffy tail, haunches)
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          {/* Long Rabbit Ears */}
          <path d="M7 8 C6 5 6 2 7 2 C8 2 9 5 8 8" />
          <path d="M9 8 C9.5 4 10.5 2 11.5 2 C12 2 12 5 11 8" />
          {/* Head & Twitching nose */}
          <path d="M6 9 C5 10 4 11 5 12 C6 13 8 13 9 12" />
          {/* Back curve to hind leg */}
          <path d="M9 10 C12 9 15 10 17 12 C19 14 19 17 16 19 C14 20 12 20 11 20" />
          {/* Fluffy tail */}
          <circle cx="19" cy="15" r="1.5" />
          {/* Front paws & chest */}
          <path d="M7 12 C6 14 6 17 7 20" />
          <path d="M9 14 L9 20" />
          {/* Hind paw */}
          <path d="M14 17 C14 19 13 20 11 20 L16 20" />
          {/* Eye */}
          <circle cx="7" cy="10" r="0.7" fill="currentColor" />
        </svg>
      );

    case 'livestock':
      // Generic livestock / Cow/Ox outline
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M3 6 L5 4 L7 6" />
          <path d="M5 4 L5 10" />
          <path d="M5 8 C8 8 12 7 18 9 C20 10 21 12 21 15" />
          <path d="M21 15 L21 21 L19 21 L19 16" />
          <path d="M19 16 C15 16 11 16 7 15 L7 21 L5 21 L5 10" />
        </svg>
      );

    default:
      // Generic Bird
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M16 7 C18 5 21 6 21 9 C21 14 16 18 9 18 C5 18 3 15 3 12 C3 9 7 6 12 6" />
          <path d="M12 6 C13 4 15 4 16 7" />
          <path d="M21 9 L23 10 L20 11" />
          <path d="M9 18 L7 22" />
          <path d="M12 18 L12 22" />
        </svg>
      );
  }
};

export default AnimalIcon;
