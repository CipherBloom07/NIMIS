import React from 'react';
import CoreOfficerInbox from './CoreOfficerInbox.jsx';

/** District collection review uses the same Core form database as mobile. */
export default function DistrictInbox(){
  return <CoreOfficerInbox stage="district"/>;
}
