import {useNavigate} from 'react-router-dom';
import {PATH} from '../paths';
import {useStudio} from '../studio/StudioContext';
import {VoicePage} from '../VoicePage';

export function VoicesRoute() {
  const navigate = useNavigate();
  const {voices, spark, produce, changeProduce, refreshVoices} = useStudio();
  return (
    <VoicePage
      voices={voices}
      spark={spark}
      currentVoice={produce.voice}
      onPicked={(id) => {
        changeProduce({...produce, voice: id});
        navigate(PATH.produce);
      }}
      onChanged={() => void refreshVoices()}
    />
  );
}
