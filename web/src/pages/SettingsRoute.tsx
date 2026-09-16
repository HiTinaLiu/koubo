import {useSearchParams} from 'react-router-dom';
import {SettingsPage} from '../SettingsPage';
import {useStudio} from '../studio/StudioContext';

export function SettingsRoute() {
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const {setLlmMeta, refreshVoices, refreshEngine, forceRestartBackend, restarting} = useStudio();
  return (
    <SettingsPage
      focus={focus === 'llm' || focus === 'components' ? focus : ''}
      onChanged={setLlmMeta}
      onModelsChanged={() => {
        void refreshVoices();
        void refreshEngine();
      }}
      onRestartBackend={() => void forceRestartBackend()}
      restarting={restarting}
    />
  );
}
