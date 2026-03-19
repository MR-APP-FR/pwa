import { I18n } from 'i18n-js';
import fr from './fr.json';
import en from './en.json';

const i18n = new I18n({ fr, en });
i18n.defaultLocale = 'fr';
i18n.locale = 'fr';
i18n.enableFallback = true;

export default i18n;
