import './styles.css';
import { connect } from './data/store.ts';
import { mountShell } from './shell.ts';
import { createDrawer } from './components/drawer.ts';
import { runScreen } from './screens/run.ts';
import { holdScreen } from './screens/hold.ts';
import { holdsScreen } from './screens/holds.ts';
import { proposalsScreen } from './screens/proposals.ts';
import { proposalScreen } from './screens/proposal.ts';
import { summaryScreen } from './screens/summary.ts';
import type { Screen } from './screens/screen.ts';

function routes(path: string[], query: URLSearchParams): Screen {
  switch (path[0]) {
    case 'holds': return path[1] ? holdScreen(path[1]) : holdsScreen(query);
    case 'proposals': return path[1] ? proposalScreen(path[1]) : proposalsScreen(query);
    case 'summary': return summaryScreen();
    default: return runScreen();
  }
}

const drawer = createDrawer();

mountShell(document.getElementById('app')!, routes, () => drawer);
connect();
