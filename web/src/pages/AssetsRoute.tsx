import {useNavigate} from 'react-router-dom';
import {AssetsPage} from '../AssetsPage';
import {PATH} from '../paths';
import {useStudio} from '../studio/StudioContext';

export function AssetsRoute() {
  const navigate = useNavigate();
  const {produce, changeProduce, refreshAssets} = useStudio();
  return (
    <AssetsPage
      onChanged={() => void refreshAssets()}
      onUseBackground={(id) => {
        changeProduce({...produce, backgroundId: id});
        void refreshAssets();
        navigate(PATH.produce);
      }}
      onUseMusic={(id) => {
        changeProduce({...produce, musicId: id});
        void refreshAssets();
        navigate(PATH.produce);
      }}
    />
  );
}
