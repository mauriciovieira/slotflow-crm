/* global React */
const { useState } = React;

// Stroke icons, 16px viewbox, currentColor. Keep count small & consistent.
const Icon = ({ d, size, className = "", fill }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
    width={size ?? 16} height={size ?? 16}
    fill={fill ?? "none"} stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" className={className}
    style={{ display: "block", flexShrink: 0 }}>
    {d}
  </svg>
);

const IconHome = (p) => <Icon {...p} d={<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></>} />;
const IconBriefcase = (p) => <Icon {...p} d={<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></>} />;
const IconKanban = (p) => <Icon {...p} d={<><rect x="3" y="4" width="5" height="14" rx="1"/><rect x="10" y="4" width="5" height="9" rx="1"/><rect x="17" y="4" width="4" height="17" rx="1"/></>} />;
const IconInbox = (p) => <Icon {...p} d={<><path d="M3 13l3-8a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l3 8"/><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></>} />;
const IconFile = (p) => <Icon {...p} d={<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></>} />;
const IconSettings = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 5l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />;
const IconSearch = (p) => <Icon {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>} />;
const IconPlus = (p) => <Icon {...p} d={<><path d="M12 5v14M5 12h14"/></>} />;
const IconFilter = (p) => <Icon {...p} d={<><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>} />;
const IconChevron = (p) => <Icon {...p} d={<><path d="m6 9 6 6 6-6"/></>} />;
const IconChevronR = (p) => <Icon {...p} d={<><path d="m9 6 6 6-6 6"/></>} />;
const IconMore = (p) => <Icon {...p} d={<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>} />;
const IconClose = (p) => <Icon {...p} d={<><path d="m6 6 12 12M6 18 18 6"/></>} />;
const IconBell = (p) => <Icon {...p} d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></>} />;
const IconSun = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>} />;
const IconMoon = (p) => <Icon {...p} d={<><path d="M21 13a8 8 0 1 1-10-10 6.5 6.5 0 0 0 10 10z"/></>} />;
const IconCalendar = (p) => <Icon {...p} d={<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>} />;
const IconMail = (p) => <Icon {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>} />;
const IconArrowUp = (p) => <Icon {...p} d={<><path d="M7 17 17 7M9 7h8v8"/></>} />;
const IconExternal = (p) => <Icon {...p} d={<><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></>} />;
const IconPin = (p) => <Icon {...p} d={<><path d="M12 2v6M5 9h14l-2 4H7z"/><path d="M12 13v9"/></>} />;
const IconStar = (p) => <Icon {...p} d={<><path d="m12 3 2.6 5.6 6 .7-4.5 4.2 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.2 6-.7z"/></>} />;
const IconCheck = (p) => <Icon {...p} d={<><path d="m5 12 5 5L20 7"/></>} />;
const IconSparkle = (p) => <Icon {...p} d={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></>} />;
const IconDrag = (p) => <Icon {...p} d={<><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></>} />;
const IconArchive = (p) => <Icon {...p} d={<><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></>} />;
const IconLink = (p) => <Icon {...p} d={<><path d="M10 14a4 4 0 0 1 0-5.7l3-3a4 4 0 0 1 5.7 5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 1 0 5.7l-3 3A4 4 0 0 1 5.3 13l1.5-1.5"/></>} />;
const IconBuilding = (p) => <Icon {...p} d={<><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-4h4v4"/></>} />;

window.Icons = {
  Home: IconHome, Briefcase: IconBriefcase, Kanban: IconKanban, Inbox: IconInbox,
  File: IconFile, Settings: IconSettings, Search: IconSearch, Plus: IconPlus,
  Filter: IconFilter, Chevron: IconChevron, ChevronR: IconChevronR, More: IconMore,
  Close: IconClose, Bell: IconBell, Sun: IconSun, Moon: IconMoon,
  Calendar: IconCalendar, Mail: IconMail, ArrowUp: IconArrowUp, External: IconExternal,
  Pin: IconPin, Star: IconStar, Check: IconCheck, Sparkle: IconSparkle,
  Drag: IconDrag, Archive: IconArchive, Link: IconLink, Building: IconBuilding,
};
