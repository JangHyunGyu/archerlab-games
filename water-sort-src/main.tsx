import { createRoot } from 'react-dom/client';
import Home from './app/page';
import './app/globals.css';
import { installDomMutationGuard } from './app/dom-guard';

const root = document.getElementById('root')!;
installDomMutationGuard(root);
createRoot(root).render(<Home />);
