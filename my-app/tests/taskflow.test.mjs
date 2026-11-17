import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createRenderer, h, nextTick } from 'vue';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.endsWith('/store/tasks') || specifier.endsWith('/data/tasks')) specifier += '.js';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.vue')) return next(url, context);
    const { descriptor } = parse(readFileSync(new URL(url), 'utf8'));
    return { format: 'module', source: compileScript(descriptor, { id: url, inlineTemplate: true }).content, shortCircuit: true };
  },
});
const { taskState, setTaskStatus, setTaskPriority } = await import('../src/store/tasks.js');
const { default: initialTasks } = await import('../src/data/tasks.js');
const { default: Home } = await import('../src/pages/HomePage.vue');
const { default: Tasks } = await import('../src/pages/TasksPage.vue');
const { default: Card } = await import('../src/components/TaskCard.vue');
const { default: StatusBadge } = await import('../src/components/StatusBadge.vue');
const { default: PriorityBadge } = await import('../src/components/PriorityBadge.vue');
const renderer = createRenderer({
  createElement: tag => ({ tag, tagName: tag.toUpperCase(), children: [], props: {}, text: '',
    addEventListener() {}, removeEventListener() {},
    get options() { return this.children; },
    get value() { return this.props.value; },
  }),
  createText: text => ({ text }), createComment: () => ({ text: '' }),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; node.children = []; },
  patchProp: (node, key, prev, value) => { node.props[key] = value; },
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  remove(node) { const p = node.parent; if (p) p.children.splice(p.children.indexOf(node), 1); node.parent = null; },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
});
function mount(component, props = {}) {
  const root = { children: [] };
  const app = renderer.createApp(component, props);
  for (const name of ['page','navbar','nav-right','link','button','card','card-content','toolbar','icon']) {
    app.component(`f7-${name}`, { setup: (_, { slots, attrs }) => () => h('div', attrs, slots.default?.()) });
  }
  app.mount(root);
  return { root, app };
}
const all = (node, predicate) => [ ...(predicate(node) ? [node] : []), ...(node.children ?? []).flatMap(child => all(child, predicate)) ];
const text = node => (node.text ?? '') + (node.children ?? []).map(text).join('');
const button = (root, label) => all(root, n => n.tag === 'button' && text(n) === label)[0];
const cards = root => all(root, n => n.props?.['data-task-id'] != null);
const click = async node => { assert.ok(node, 'Елемент існує'); node.props.onClick(); await nextTick(); };

test('TaskFlow: store, Props/Emits, filters, sorting and shared statistics', async () => {
  assert.equal(taskState.tasks.length, 10);
  setTaskStatus({ id: 1, status: 'invalid' });
  setTaskPriority({ id: 1, priority: 'invalid' });
  setTaskStatus({ id: 999, status: 'done' });
  assert.equal(taskState.tasks[0].status, 'todo');
  assert.equal(taskState.tasks[0].priority, 'high');
  const events = [];
  const frozen = Object.freeze({ ...initialTasks[0] });
  const card = mount(Card, { task: frozen, onStatusChange: p => events.push(p), onPriorityChange: p => events.push(p), onTaskSelect: p => events.push(p) });
  await click(button(card.root, 'Взяти в роботу'));
  await click(button(card.root, 'Змінити пріоритет'));
  await click(button(card.root, frozen.title));
  assert.deepEqual(events, [{ id: 1, status: 'progress' }, { id: 1, priority: 'low' }, { id: 1 }]);
  assert.equal(frozen.status, 'todo'); card.app.unmount();
  for (const [Component, props, label] of [[StatusBadge, {status:'other'}, 'Невідомо'], [PriorityBadge, {priority:'other'}, 'Не визначено']]) {
    const badge = mount(Component, props); assert.equal(text(badge.root), label); badge.app.unmount();
  }
  const home = mount(Home); const tasks = mount(Tasks);
  const stats = () => all(home.root, n => n.tag === 'strong').map(n => Number(text(n)));
  assert.deepEqual(stats(), [10,3,3,4]);
  assert.equal(cards(home.root).length, 3);
  assert.equal(cards(tasks.root).length, 10);
  await click(button(tasks.root, 'У роботі')); await click(button(tasks.root, 'Високий'));
  assert.deepEqual(cards(tasks.root).map(n => n.props['data-task-id']), [3]);
  await click(button(tasks.root, 'Завершити'));
  assert.equal(cards(tasks.root).length, 0);
  assert.ok(text(tasks.root).includes('За обраними фільтрами завдань не знайдено.'));
  assert.deepEqual(stats(), [10,2,4,4]);
  assert.ok(text(home.root).includes('40%'));
  const filterGroups = all(tasks.root, n => n.props?.class === 'tf3-filter-buttons');
  for (const group of filterGroups) await click(button(group, 'Усі'));
  const select = all(tasks.root, n => n.tag === 'select')[0];
  // v-model on native select uses a DOM directive; update the component model through its generated handler.
  select.props['onUpdate:modelValue']('high'); await nextTick();
  assert.deepEqual(cards(tasks.root).slice(0,3).map(n => n.props['data-task-id']), [1,3,9]);
  select.props['onUpdate:modelValue']('low'); await nextTick();
  assert.deepEqual(cards(tasks.root).slice(0,3).map(n => n.props['data-task-id']), [5,6,7]);
  for (const expected of ['progress','done','todo']) { setTaskStatus({id:1,status:expected}); await nextTick(); assert.equal(taskState.tasks[0].status,expected); }
  for (const expected of ['low','medium','high']) { setTaskPriority({id:1,priority:expected}); await nextTick(); assert.equal(taskState.tasks[0].priority,expected); }
  await click(button(tasks.root, initialTasks[0].title));
  assert.ok(text(tasks.root).includes('Обране завдання № 1'));
  await click(button(tasks.root, 'Закрити'));
  home.app.unmount(); tasks.app.unmount();
  taskState.tasks = initialTasks.map(task => ({...task}));
});
