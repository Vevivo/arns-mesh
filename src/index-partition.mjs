// Operator-assigned partitions divide first-producer work between index nodes.
// They are scheduling hints, never evidence that a block has been indexed.
export function indexPartition(value='0/1') {
  if(typeof value!=='string'||!/^\d+\/\d+$/.test(value))throw new Error('invalid_index_partition');
  const [slot,count]=value.split('/').map(Number);
  if(!Number.isInteger(count)||count<1||count>64||!Number.isInteger(slot)||slot<0||slot>=count)throw new Error('invalid_index_partition');
  return {
    key:`${slot}/${count}`,slot,count,
    owns:height=>Number.isSafeInteger(height)&&height>=0&&height%count===slot,
    before:height=>height-((height-slot)%count+count)%count,
    after:height=>height+((slot-height-1)%count+count)%count+1,
  };
}
