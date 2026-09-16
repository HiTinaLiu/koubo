import {LibraryPage} from '../LibraryPage';
import {useStudio} from '../studio/StudioContext';

export function LibraryRoute() {
  const {openJob} = useStudio();
  return (
    <LibraryPage
      onReuse={(next, step) => {
        openJob(next, step);
      }}
    />
  );
}
