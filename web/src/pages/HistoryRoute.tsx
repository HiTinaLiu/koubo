import {HistoryPage} from '../HistoryPage';
import {useStudio} from '../studio/StudioContext';

export function HistoryRoute() {
  const {view, openJob, resetJob} = useStudio();
  return (
    <HistoryPage
      onOpen={(next, nextStep) => openJob(next, nextStep)}
      onDeleted={(id) => {
        if (view?.job.id === id) resetJob();
      }}
    />
  );
}
