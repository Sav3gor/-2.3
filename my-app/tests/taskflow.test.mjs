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
const { taskState, addTask, updateTask, setTaskStatus, setTaskPriority } = await import('../src/store/tasks.js');
const { default: initialTasks } = await import('../src/data/tasks.js');
const { default: TaskForm } = await import('../src/components/TaskForm.vue');
const { localDate, isValidDate, validateTask } = await import('../src/utils/task-validation.js');
globalThis.Document = class Document {};
globalThis.ShadowRoot = class ShadowRoot {};
globalThis.document = Object.assign(new Document(), { activeElement: null });
const { default: Home } = await import('../src/pages/HomePage.vue');
const { default: Tasks } = await import('../src/pages/TasksPage.vue');
const { default: Card } = await import('../src/components/TaskCard.vue');
const { default: StatusBadge } = await import('../src/components/StatusBadge.vue');
const { default: PriorityBadge } = await import('../src/components/PriorityBadge.vue');
const renderer = createRenderer({
  createElement: tag => ({ tag, tagName: tag.toUpperCase(), children: [], props: {}, text: '',
    addEventListener() {}, removeEventListener() {}, getRootNode() { return globalThis.document; }, focus() {}, scrollIntoView() {}, querySelector() { return null; }, getAttribute(key) { return this.props[key]; },
    get options() { return this.children; },
    get value() { return this.props.value; },
    set value(value) { this.props.value = value; },
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

const field = (root, id) => all(root, n => n.props?.id === id)[0];
const model = async (root, id, value) => {
  const element = field(root, id);
  assert.ok(element, `Поле ${id} існує`);
  element.props['onUpdate:modelValue'](value);
  await nextTick();
};
const submit = async root => {
  const form = all(root, n => n.tag === 'form')[0];
  assert.ok(form, 'Форма існує');
  await form.props.onSubmit({ preventDefault() {} });
  await nextTick();
};
const reset = () => { taskState.tasks = initialTasks.map(task => ({ ...task, category: 'study' })); };
const future = localDate(new Date(new Date().getFullYear() + 1, 5, 15));
const validData = (overrides = {}) => ({ title: 'Підготувати презентацію', description: 'Слайди до захисту',
  status: 'todo', priority: 'high', category: 'work', dueDate: future, ...overrides });

test('T1–T2: порожня форма, коротка назва, помилки та доступність', async () => {
  reset(); const events = []; const form = mount(TaskForm, { onSave: data => events.push(data) });
  assert.ok(!text(form.root).includes('Вкажіть назву завдання.'));
  await submit(form.root);
  assert.equal(events.length, 0);
  assert.ok(text(form.root).includes('Вкажіть назву завдання.'));
  assert.ok(text(form.root).includes('Укажіть коректну дату завершення.'));
  assert.equal(field(form.root, 'tf4-title').props['aria-invalid'], true);
  assert.ok(field(form.root, 'tf4-title').props['aria-describedby'].includes('tf4-title-error'));
  for (const title of ['А', 'АБ', '   ']) {
    await model(form.root, 'tf4-title', title); await submit(form.root);
    assert.equal(events.length, 0);
  }
  await model(form.root, 'tf4-title', 'АБ');
  assert.ok(text(form.root).includes('щонайменше 3 символи'));
  form.app.unmount();
});

test('T3, T6, T7: створення через форму, preview, скидання фільтрів і спільна статистика', async () => {
  reset(); const home = mount(Home); const tasks = mount(Tasks);
  await click(button(tasks.root, 'У роботі')); await click(button(tasks.root, 'Високий'));
  await model(tasks.root, 'tf4-search', 'індикатор');
  assert.equal(cards(tasks.root).length, 1);
  await click(button(tasks.root, '+ Додати завдання'));
  for (const [id, value] of Object.entries({ title: '  Підготувати презентацію  ', description: '  Слайди до захисту  ', status: 'done', priority: 'high', category: 'work', date: future })) {
    await model(tasks.root, `tf4-${id}`, value);
  }
  assert.ok(text(all(tasks.root, n => n.props?.class === 'tf4-preview tf4-field--wide')[0]).includes('Підготувати презентацію'));
  assert.ok(text(tasks.root).includes('Робота'));
  await submit(tasks.root);
  assert.equal(taskState.tasks.length, 11);
  assert.equal(taskState.tasks.at(-1).id, 11);
  assert.equal(taskState.tasks.at(-1).title, 'Підготувати презентацію');
  assert.equal(taskState.tasks.at(-1).description, 'Слайди до захисту');
  assert.equal(taskState.tasks.at(-1).category, 'work');
  assert.equal(cards(tasks.root).length, 11);
  assert.equal(field(tasks.root, 'tf4-search').props.value, '');
  assert.equal(all(tasks.root, n => n.tag === 'form').length, 0);
  assert.deepEqual(all(home.root, n => n.tag === 'strong').map(n => Number(text(n))), [11,3,4,4]);
  assert.ok(text(tasks.root).includes('створено.'));
  home.app.unmount(); tasks.app.unmount(); reset();
});

test('T4–T5: редагування з тим самим ID та скасування без зміни оригіналу', async () => {
  reset(); const tasks = mount(Tasks); const original = { ...taskState.tasks[0] };
  await click(button(cards(tasks.root)[0], 'Редагувати'));
  assert.equal(field(tasks.root, 'tf4-title').props.value, original.title);
  await model(tasks.root, 'tf4-title', 'Змінена назва');
  assert.deepEqual({ ...taskState.tasks[0] }, original);
  await click(button(tasks.root, 'Скасувати'));
  assert.deepEqual({ ...taskState.tasks[0] }, original);
  await click(button(cards(tasks.root)[0], 'Редагувати'));
  assert.equal(field(tasks.root, 'tf4-title').props.value, original.title);
  await model(tasks.root, 'tf4-title', 'Збережена нова назва');
  await model(tasks.root, 'tf4-priority', 'low');
  await model(tasks.root, 'tf4-category', 'personal');
  await submit(tasks.root);
  assert.equal(taskState.tasks.length, 10);
  assert.equal(taskState.tasks[0].id, original.id);
  assert.equal(taskState.tasks[0].title, 'Збережена нова назва');
  assert.equal(taskState.tasks[0].dueDate, original.dueDate);
  assert.equal(taskState.tasks[0].priority, 'low');
  assert.equal(taskState.tasks[0].category, 'personal');
  assert.ok(text(cards(tasks.root)[0]).includes('Особисте'));
  const home = mount(Home); assert.ok(!button(cards(home.root)[0], 'Редагувати')); home.app.unmount();
  tasks.app.unmount(); reset();
});

test('Сховище: календар, межі, унікальність, ID і захист від некоректних даних', () => {
  reset(); const original = JSON.stringify(taskState.tasks);
  for (const invalid of [null, {}, validData({title:'А'}), validData({title:'А'.repeat(81)}),
    validData({description:'А'.repeat(301)}), validData({status:'invalid'}), validData({priority:'invalid'}),
    validData({category:'invalid'}), validData({dueDate:'2027-02-30'}), validData({dueDate:'2000-01-01'}),
    validData({title:'  '+initialTasks[0].title.toLocaleUpperCase('uk-UA')+'  '})]) {
    assert.equal(addTask(invalid), null);
  }
  assert.equal(JSON.stringify(taskState.tasks), original);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2027-02-29'), false);
  assert.equal(isValidDate('2027-04-31'), false);
  assert.equal(isValidDate('2027-01-01\n'), false);
  assert.ok(validateTask(validData({dueDate:'2027-01-01'}), {today:'2027-01-02'}).dueDate);
  assert.deepEqual(validateTask(validData({dueDate:'2027-01-02'}), {today:'2027-01-02'}), {});
  assert.equal(updateTask(null), null);
  assert.equal(updateTask({id:999, ...validData()}), null);
  assert.equal(updateTask({...taskState.tasks[0], dueDate:'2000-01-01'}), null);
  assert.ok(updateTask({...taskState.tasks[0], title:'Зміна старого завдання'}));
  const limits = addTask(validData({title:'А'.repeat(80), description:'А'.repeat(300)}));
  assert.ok(limits);
  taskState.tasks.push({...validData({title:'Запис із великим ID'}), id:250});
  assert.equal(addTask(validData()).id, 251);
  reset();
});

test('Додаткові завдання: очищення, лічильники, пошук і дублікати у формі', async () => {
  reset(); const events = [];
  const form = mount(TaskForm, { tasks: taskState.tasks, onSave: data => events.push(data) });
  await model(form.root, 'tf4-title', initialTasks[0].title.toLocaleUpperCase('uk-UA'));
  await model(form.root, 'tf4-date', future); await submit(form.root);
  assert.equal(events.length, 0);
  assert.ok(text(form.root).includes('Завдання з такою назвою вже існує.'));
  await model(form.root, 'tf4-title', 'Тест');
  await model(form.root, 'tf4-description', 'Опис');
  assert.ok(text(form.root).includes('Залишилося: 76/80'));
  assert.ok(text(form.root).includes('Залишилося: 296/300'));
  await model(form.root, 'tf4-status', 'done'); await model(form.root, 'tf4-category', 'personal');
  await click(button(form.root, 'Очистити форму'));
  for (const [id, expected] of Object.entries({title:'', description:'', status:'todo', priority:'medium', category:'study', date:''})) {
    const element = field(form.root, `tf4-${id}`);
    if (element.tag !== 'select') assert.equal(element.props.value, expected);
  }
  assert.ok(!text(form.root).includes('Завдання з такою назвою вже існує.'));
  await submit(form.root); assert.equal(events.length,0);
  form.app.unmount();
  const tasks = mount(Tasks);
  await model(tasks.root, 'tf4-search', '  ІНДИКАТОР  ');
  assert.deepEqual(cards(tasks.root).map(n => n.props['data-task-id']), [3]);
  await model(tasks.root, 'tf4-search', 'немає такої назви'); assert.equal(cards(tasks.root).length, 0);
  tasks.app.unmount(); reset();
});

test('T8: повторна ініціалізація модуля відновлює початкові дані', async () => {
  reset(); assert.ok(addTask(validData())); assert.equal(taskState.tasks.length, 11);
  const moduleUrl = new URL('../src/store/tasks.js', import.meta.url).href;
  const { taskState: freshState } = await import(`${moduleUrl}?fresh-session`);
  const freshTasks = freshState.tasks;
  assert.equal(freshTasks.length, 10);
  assert.deepEqual(freshTasks.map(task => task.title), initialTasks.map(task => task.title));
  reset();
});
