import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/course.css';
import './styles/lesson.css';
import './styles/diagram.css';
import './styles/pages.css';

import { bootstrap } from './app';

bootstrap().catch((err: unknown) => {
  console.error('Приложение не запустилось:', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.textContent = '';
    const msg = document.createElement('div');
    msg.className = 'boot__error';
    msg.textContent =
      'Не удалось запустить приложение. Попробуйте перезагрузить страницу. ' +
      (err instanceof Error ? err.message : String(err));
    boot.append(msg);
  }
});
