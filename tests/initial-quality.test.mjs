import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';

const traits = () => ({education:{id:'edu_puben'},major:{id:'major_sci'},personalities:[],extraDegrees:[],other:[]});
test('fixed traits receive all eleven equally spaced initial variations', () => {
  const random=Math.random;
  try {
    for(let i=0;i<11;i++) {
      Math.random=()=> (i+.5)/11;
      const s=createInitialState({rolledTraits:traits(),playerTalents:[]});
      assert.equal(s.initialQualityVariation,i-5);
      assert.equal(s.resumeQuality,50+i-5);
      assert.ok(s.log.some(row=>row.msg.includes(`初始综合素质 ${s.resumeQuality}`)));
    }
  } finally {Math.random=random;}
});
test('positive fluctuation respects cap and existing starting talent bonus', () => {
  const random=Math.random;
  try {
    Math.random=()=>.999999;
    const s=createInitialState({rolledTraits:traits(),playerTalents:[{id:'normal_human'}]});
    assert.equal(s.resumeQuality,58);
    const boosted=traits();boosted.other=[{effects:{resumeQuality:100}}];
    assert.equal(createInitialState({rolledTraits:boosted,playerTalents:[]}).resumeQuality,120);
  } finally {Math.random=random;}
});
