import React from 'react';
import CoreOfficerInbox from './CoreOfficerInbox.jsx';

/** Province and Admin share the identical authoritative Core workflow. */
export default function ReviewStageInbox({stage}){
  return <CoreOfficerInbox stage={stage==='admin'?'admin':'provincial'}/>;
}
