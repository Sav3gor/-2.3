import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import { createRenderer, h, nextTick } from 'vue';
import { createPinia, setActivePinia, storeToRefs } from 'pinia';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.endsWith('/store/tasks') || specifier.endsWith('/data/tasks')) specifier += '.js';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith('.vue')) return next(url, context);
    const { descriptor } = parse(readFileSync(new URL(url), 'utf8'));
    return { format: 'module', source: compileScript(descriptor, { id: url, inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } }).content, shortCircuit: true };
  },
});
const { useTasksStore } = await import('../src/store/tasks.js');
const { useProjectsStore } = await import('../src/store/projects.js');
const testPinia = createPinia();
setActivePinia(testPinia);
const taskState = useTasksStore(testPinia);
const projectStore = useProjectsStore(testPinia);
const { addTask, updateTask, deleteTask, setTaskStatus, setTaskPriority } = taskState;
const { default: initialTasks } = await import('../src/data/tasks.js');
const { default: TaskListControls } = await import('../src/components/TaskListControls.vue');
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
  app.use(testPinia);
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
  await model(tasks.root, 'tf5-status', 'progress'); await model(tasks.root, 'tf5-priority', 'high');
  assert.deepEqual(cards(tasks.root).map(n => n.props['data-task-id']), [3]);
  await click(button(tasks.root, 'Завершити'));
  assert.equal(cards(tasks.root).length, 0);
  assert.ok(text(tasks.root).includes('За обраними фільтрами завдань не знайдено.'));
  assert.deepEqual(stats(), [10,2,4,4]);
  assert.ok(text(home.root).includes('40%'));
  await click(button(tasks.root, 'Скинути фільтри'));
  await model(tasks.root, 'tf5-sort', 'priority');
  assert.deepEqual(cards(tasks.root).slice(0,3).map(n => n.props['data-task-id']), [9,3,1]);
  await model(tasks.root, 'tf5-sort', 'priorityLow');
  assert.deepEqual(cards(tasks.root).slice(0,3).map(n => n.props['data-task-id']), [7,6,5]);
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
  if (element.props['onUpdate:modelValue']) element.props['onUpdate:modelValue'](value);
  else (element.props.onInput ?? element.props.onChange)({ target: { value } });
  await nextTick();
};
const submit = async root => {
  const form = all(root, n => n.tag === 'form' && n.props?.class === 'tf4-form')[0];
  assert.ok(form, 'Форма існує');
  await form.props.onSubmit({ preventDefault() {} });
  await nextTick();
};
const reset = () => { setActivePinia(testPinia); taskState.$reset(); projectStore.$reset(); };
const future = localDate(new Date(new Date().getFullYear() + 1, 5, 15));
const validData = (overrides = {}) => ({ title: 'Підготувати презентацію', description: 'Слайди до захисту',
  status: 'todo', priority: 'high', category: 'work', dueDate: future, ...overrides });

test('T1–T2: порожня форма, коротка назва, помилки та доступність', async () => {
  reset(); const events = []; const form = mount(TaskForm, { onSave: data => events.push(data) });
  assert.ok(!text(form.root).includes('Вкажіть назву завдання.'));
  await submit(form.root);
  assert.equal(events.length, 0);
  assert.ok(text(form.root).includes('Вкажіть назву завдання.'));
  assert.ok(!text(form.root).includes('Укажіть коректну дату завершення.'));
  await model(form.root, 'tf4-date', '2027-02-30'); await submit(form.root);
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
  await model(tasks.root, 'tf5-status', 'progress'); await model(tasks.root, 'tf5-priority', 'high');
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
  assert.equal(all(tasks.root, n => n.tag === 'form' && n.props?.class === 'tf4-form').length, 0);
  assert.deepEqual(all(home.root, n => n.tag === 'strong').map(n => Number(text(n))), [11,3,4,4]);
  assert.ok(text(tasks.root).includes('створено.'));
  home.app.unmount(); tasks.app.unmount(); reset();
});

test('T4–T5: редагування з тим самим ID та скасування без зміни оригіналу', async () => {
  reset(); const tasks = mount(Tasks); const original = { ...taskState.tasks[0] };
  await click(button(cards(tasks.root).find(n => n.props['data-task-id'] === 1), 'Редагувати'));
  assert.equal(field(tasks.root, 'tf4-title').props.value, original.title);
  await model(tasks.root, 'tf4-title', 'Змінена назва');
  assert.deepEqual({ ...taskState.tasks[0] }, original);
  await click(button(tasks.root, 'Скасувати'));
  assert.deepEqual({ ...taskState.tasks[0] }, original);
  await click(button(cards(tasks.root).find(n => n.props['data-task-id'] === 1), 'Редагувати'));
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
  assert.ok(text(cards(tasks.root).find(n => n.props['data-task-id'] === 1)).includes('Особисте'));
  const home = mount(Home); assert.ok(!button(cards(home.root)[0], 'Редагувати')); home.app.unmount();
  tasks.app.unmount(); reset();
});

test('Сховище: календар, межі, унікальність, ID і захист від некоректних даних', () => {
  reset(); const original = JSON.stringify(taskState.tasks);
  for (const invalid of [null, {}, validData({title:'А'}), validData({title:'А'.repeat(81)}),
    validData({description:'А'.repeat(501)}), validData({status:'invalid'}), validData({priority:'invalid'}),
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
  const limits = addTask(validData({title:'А'.repeat(80), description:'А'.repeat(500)}));
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
  assert.ok(text(form.root).includes('Залишилося: 496/500'));
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
  const { useTasksStore: freshFactory } = await import(`${moduleUrl}?fresh-session`);
  const freshState = freshFactory(createPinia());
  const freshTasks = freshState.tasks;
  assert.equal(freshTasks.length, 10);
  assert.deepEqual(freshTasks.map(task => task.title), initialTasks.map(task => task.title));
  reset();
});

const ids = root => cards(root).map(node => node.props['data-task-id']);
const taskCard = (root, id) => cards(root).find(node => node.props['data-task-id'] === id);

test('01–05, 12–13: пошук у назві й описі, комбіновані фільтри та скидання', async () => {
  reset(); const tasks = mount(Tasks);
  await model(tasks.root, 'tf4-search', '  ІНДИКАТОР  ');
  assert.deepEqual(ids(tasks.root), [3]);
  await model(tasks.root, 'tf4-search', 'кешування');
  assert.deepEqual(ids(tasks.root), [7]);
  await click(button(tasks.root, 'Очистити пошук'));
  assert.equal(ids(tasks.root).length, 10);
  assert.ok(!button(tasks.root, 'Очистити пошук'));
  await model(tasks.root, 'tf5-status', 'done');
  assert.deepEqual(ids(tasks.root), [9,6,2]);
  await model(tasks.root, 'tf5-priority', 'high');
  assert.deepEqual(ids(tasks.root), [9]);
  await model(tasks.root, 'tf4-search', 'такого завдання немає');
  assert.equal(ids(tasks.root).length, 0);
  assert.ok(text(tasks.root).includes('За обраними фільтрами завдань не знайдено.'));
  await click(button(tasks.root, 'Показати всі завдання'));
  assert.deepEqual(ids(tasks.root), [10,9,8,7,6,5,4,3,2,1]);
  assert.equal(field(tasks.root, 'tf5-sort').props.value, 'newest');
  tasks.app.unmount(); reset();
});

test('06–07: усі режими сортування, українська абетка, порожні дати та незмінність масиву', async () => {
  reset(); const tasks = mount(Tasks); const originalIds = taskState.tasks.map(task => task.id);
  await model(tasks.root, 'tf5-sort', 'title');
  const titles = cards(tasks.root).map(card => text(all(card, n => n.props?.class === 'tf3-select-task')[0]));
  assert.deepEqual(titles, [...titles].sort((a,b) => a.localeCompare(b,'uk-UA')));
  assert.ok(addTask(validData({title:'Без терміну', dueDate:''})));
  assert.ok(addTask(validData({title:'Ще одне без терміну', dueDate:''})));
  await nextTick();
  for (const [sort, reverse] of [['dueDate',false], ['dueDateDesc',true]]) {
    await model(tasks.root, 'tf5-sort', sort);
    assert.deepEqual(ids(tasks.root).slice(-2), [12,11]);
    const dates = ids(tasks.root).slice(0,-2).map(id => taskState.tasks.find(t => t.id === id).dueDate);
    assert.deepEqual(dates, [...dates].sort((a,b) => reverse ? b.localeCompare(a) : a.localeCompare(b)));
  }
  await model(tasks.root, 'tf5-sort', 'oldest');
  assert.deepEqual(ids(tasks.root).slice(0,10), originalIds);
  assert.deepEqual(taskState.tasks.slice(0,10).map(task => task.id), originalIds);
  await model(tasks.root, 'tf5-sort', 'status');
  assert.deepEqual(ids(tasks.root).slice(0,3), [8,5,3]);
  assert.deepEqual(taskState.tasks.slice(0,10).map(task => task.id), originalIds);
  tasks.app.unmount(); reset();
});

test('08–11: видалення з підтвердженням, редагування і спільний стан', async () => {
  reset(); const tasks = mount(Tasks); const home = mount(Home); const confirms = [];
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { confirm: message => { confirms.push(message); return false; } };
    await click(button(taskCard(tasks.root, 1), 'Видалити'));
    assert.equal(taskState.tasks.length,10);
    assert.ok(confirms[0].includes(initialTasks[0].title));
    await click(button(taskCard(tasks.root,1), initialTasks[0].title));
    await click(button(taskCard(tasks.root,1), 'Редагувати'));
    globalThis.window.confirm = () => true;
    await click(button(taskCard(tasks.root,1), 'Видалити'));
    assert.equal(taskState.tasks.length,9);
    assert.ok(!taskCard(tasks.root,1));
    assert.equal(all(tasks.root,n => n.tag === 'form' && n.props?.class === 'tf4-form').length,0);
    assert.ok(!text(tasks.root).includes('Обране завдання № 1'));
    assert.deepEqual(all(home.root,n => n.tag === 'strong').map(n => Number(text(n))),[9,3,3,3]);
    assert.equal(deleteTask(999),false);
    assert.equal(taskState.tasks.length,9);
    await click(button(taskCard(tasks.root,3), 'Завершити'));
    assert.equal(taskState.tasks.find(t => t.id === 3).status,'done');
    assert.deepEqual(all(home.root,n => n.tag === 'strong').map(n => Number(text(n))),[9,2,4,3]);
    await click(button(taskCard(tasks.root,2), 'Редагувати'));
    await model(tasks.root,'tf4-title','Оновлена назва навігації'); await submit(tasks.root);
    await model(tasks.root,'tf4-search','Оновлена назва');
    assert.deepEqual(ids(tasks.root),[2]);
  } finally {
    globalThis.window = previousWindow;
    tasks.app.unmount(); home.app.unmount(); reset();
  }
});

test('Додаткові 1–6: невиконані, статуси, відсоток вибірки, порожній список та відновлення', async () => {
  reset(); const tasks = mount(Tasks); const home = mount(Home);
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { confirm: () => true };
    assert.ok(text(tasks.root).includes('Виконано у вибірці: 30%'));
    await click(button(tasks.root, 'Тільки невиконані'));
    assert.equal(ids(tasks.root).length,7);
    assert.equal(button(tasks.root, 'Тільки невиконані').props['aria-pressed'],true);
    assert.ok(text(tasks.root).includes('Виконано у вибірці: 0%'));
    await model(tasks.root,'tf5-priority','high');
    assert.deepEqual(ids(tasks.root),[3,1]);
    await model(tasks.root,'tf5-status','done');
    assert.equal(ids(tasks.root).length,0);
    await click(button(tasks.root,'Скинути фільтри'));
    assert.equal(button(tasks.root,'Тільки невиконані').props['aria-pressed'],false);
    await model(tasks.root,'tf5-status','done');
    assert.ok(text(tasks.root).includes('Виконано у вибірці: 100%'));
    await click(button(tasks.root,'Скинути фільтри'));
    for (const id of [...ids(tasks.root)]) await click(button(taskCard(tasks.root,id),'Видалити'));
    assert.equal(taskState.tasks.length,0);
    assert.ok(text(tasks.root).includes('Список завдань порожній'));
    assert.ok(!text(tasks.root).includes('За обраними фільтрами завдань не знайдено.'));
    assert.ok(text(tasks.root).includes('Виконано у вибірці: 0%'));
    assert.deepEqual(all(home.root,n => n.tag === 'strong').map(n => Number(text(n))),[0,0,0,0]);
    await click(button(tasks.root,'Створити перше завдання'));
    await model(tasks.root,'tf4-title','Відновлення списку'); await submit(tasks.root);
    assert.equal(taskState.tasks.length,1);
    assert.equal(taskState.tasks[0].dueDate,'');
    assert.ok(!text(tasks.root).includes('Список завдань порожній'));
    assert.equal(deleteTask(String(taskState.tasks[0].id)),true);
    const moduleUrl = new URL('../src/store/tasks.js', import.meta.url).href;
    const { useTasksStore: restoredFactory } = await import(`${moduleUrl}?after-delete`);
    const restored = restoredFactory(createPinia());
    assert.equal(restored.tasks.length,10);
  } finally {
    globalThis.window = previousWindow;
    tasks.app.unmount(); home.app.unmount(); reset();
  }
});

test('TaskListControls: контрольовані Props та update-події без зміни вхідних даних', async () => {
  const received=[];
  const props = Object.freeze({ search:'тест', status:'all', priority:'all', sort:'newest', incomplete:false });
  const controls=mount(TaskListControls, { ...props,
    'onUpdate:search': value => received.push(['search',value]),
    'onUpdate:status': value => received.push(['status',value]),
    'onUpdate:priority': value => received.push(['priority',value]),
    'onUpdate:sort': value => received.push(['sort',value]),
    'onUpdate:incomplete': value => received.push(['incomplete',value]),
    onReset: () => received.push(['reset']),
  });
  await model(controls.root,'tf4-search','новий');
  await model(controls.root,'tf5-status','done');
  await model(controls.root,'tf5-priority','high');
  await model(controls.root,'tf5-sort','title');
  await click(button(controls.root,'Тільки невиконані'));
  await click(button(controls.root,'Очистити пошук'));
  await click(button(controls.root,'Скинути фільтри'));
  assert.deepEqual(received,[['search','новий'],['status','done'],['priority','high'],['sort','title'],['incomplete',true],['search',''],['reset']]);
  assert.equal(props.search,'тест'); assert.equal(field(controls.root,'tf4-search').props.value,'тест');
  controls.app.unmount();
});

const submitProject = async root => {
  const form = all(root, node => node.tag === 'form' && node.props?.class === 'tf6-project-form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  await nextTick();
};

test('Pinia 02–05: getters, каталог, створення та дублікати проєктів', async () => {
  reset();
  assert.deepEqual([taskState.totalTasks,taskState.progressTasks,taskState.completedTasks], [10,3,3]);
  assert.equal(projectStore.projectCount,3);
  assert.deepEqual(projectStore.projects.map(p => p.title), ['Загальні','Навчання','Особисті']);
  assert.ok(taskState.tasks.every(task => task.projectId === 'general'));
  assert.equal(projectStore.projectStats[0].total,10);
  assert.equal(projectStore.projectStats[0].incomplete,7);
  assert.equal(projectStore.projectStats[0].completionPercent,30);
  assert.equal(projectStore.projectStats[1].completionPercent,0);
  assert.equal(projectStore.addProject('А'),null);
  assert.equal(projectStore.addProject('А'.repeat(41)),null);
  const tasks=mount(Tasks);
  await model(tasks.root,'tf6-project-title','  Лабораторні  '); await submitProject(tasks.root);
  const project=projectStore.projects.at(-1);
  assert.equal(project.title,'Лабораторні');
  assert.equal(taskState.selectedProject,project.id);
  assert.equal(field(tasks.root,'tf6-project-filter').props.value,project.id);
  assert.ok(text(tasks.root).includes('Лабораторні'));
  await model(tasks.root,'tf6-project-title','ЛАБОРАТОРНІ'); await submitProject(tasks.root);
  assert.equal(projectStore.projectCount,4);
  assert.ok(text(tasks.root).includes('Назва має містити 3–40 символів'));
  tasks.app.unmount(); reset();
});

test('Pinia 06–09: завдання з проєктом, комбінована фільтрація та зміна проєкту', async () => {
  reset(); const project=projectStore.addProject('Лабораторні');
  const tasks=mount(Tasks); const home=mount(Home);
  await model(tasks.root,'tf6-project-filter',project.id);
  await click(button(tasks.root,'+ Додати завдання'));
  await model(tasks.root,'tf4-title','Завдання для лабораторної');
  assert.ok(text(field(tasks.root,'tf6-task-project')).includes('Лабораторні'));
  await model(tasks.root,'tf4-status','progress');
  await model(tasks.root,'tf4-priority','high');
  await submit(tasks.root);
  const task=taskState.tasks.at(-1);
  assert.equal(task.projectId,project.id);
  assert.ok(text(taskCard(tasks.root,task.id)).includes('Проєкт: Лабораторні'));
  assert.equal(projectStore.projectStats.find(p=>p.id===project.id).total,1);
  assert.ok(text(home.root).includes('Лабораторні'));
  assert.equal(taskState.totalTasks,11);
  await model(tasks.root,'tf6-project-filter',project.id);
  await model(tasks.root,'tf5-status','progress');
  await model(tasks.root,'tf5-priority','high');
  await model(tasks.root,'tf4-search','лабораторної');
  assert.deepEqual(ids(tasks.root),[task.id]);
  await click(button(taskCard(tasks.root,task.id),'Редагувати'));
  await model(tasks.root,'tf6-task-project','personal'); await submit(tasks.root);
  assert.equal(task.projectId,'personal');
  assert.equal(projectStore.projectStats.find(p=>p.id===project.id).total,0);
  assert.equal(projectStore.projectStats.find(p=>p.id==='personal').total,1);
  await model(tasks.root,'tf6-project-filter',project.id);
  assert.equal(ids(tasks.root).length,0);
  const normalized=addTask(validData({ title:'Невідомий проєкт',projectId:'missing' }));
  assert.equal(normalized.projectId,'general');
  tasks.app.unmount();home.app.unmount();reset();
});

test('Pinia 10, 13–15: storeToRefs, збереження фільтрів при перемиканні та новий сеанс', async () => {
  reset();const tasks=mount(Tasks);
  const { totalTasks, selectedProject, visibleTasks } = storeToRefs(taskState);
  await model(tasks.root,'tf6-project-filter','study');
  await model(tasks.root,'tf5-status','done');
  await model(tasks.root,'tf5-sort','title');
  await click(button(tasks.root,'Лише без терміну'));
  assert.equal(selectedProject.value,'study');assert.equal(visibleTasks.value.length,0);
  tasks.app.unmount(); const home=mount(Home);home.app.unmount();
  const reopened=mount(Tasks);
  assert.equal(field(reopened.root,'tf6-project-filter').props.value,'study');
  assert.equal(field(reopened.root,'tf5-status').props.value,'done');
  assert.equal(field(reopened.root,'tf5-sort').props.value,'title');
  assert.equal(button(reopened.root,'Лише без терміну').props['aria-pressed'],true);
  await click(button(reopened.root,'Скинути фільтри'));
  assert.equal(selectedProject.value,'all');assert.equal(taskState.withoutDueDate,false);
  addTask(validData());assert.equal(totalTasks.value,11);
  projectStore.addProject('Тестовий проєкт');
  const fresh=createPinia();
  assert.equal(useTasksStore(fresh).totalTasks,10);
  assert.equal(useProjectsStore(fresh).projectCount,3);
  reopened.app.unmount();reset();
});

test('Додаткові 1–5: проєктна статистика, групова дія і фільтр без терміну', async () => {
  reset();const project=projectStore.addProject('Робочий проєкт');
  const first=addTask(validData({title:'Перше проєктне',projectId:project.id,dueDate:''}));
  addTask(validData({title:'Друге проєктне',projectId:project.id,status:'done'}));
  const tasks=mount(Tasks);const home=mount(Home);const oldWindow=globalThis.window;
  const actions=[];const stop=taskState.$onAction(({name})=>actions.push(name));
  try {
    assert.equal(taskState.startCurrentProjectTasks(),0);
    await model(tasks.root,'tf6-project-filter',project.id);
    await click(button(tasks.root,'Лише без терміну'));
    assert.deepEqual(ids(tasks.root),[first.id]);
    assert.equal(projectStore.projectStats.find(p=>p.id===project.id).completionPercent,50);
    globalThis.window={confirm:()=>false};
    await click(button(tasks.root,'Усі завдання проєкту — у роботу'));
    assert.equal(first.status,'todo');
    globalThis.window.confirm=message=>{ assert.ok(message.includes(project.title));return true; };
    await click(button(tasks.root,'Усі завдання проєкту — у роботу'));
    assert.ok(taskState.tasks.filter(t=>t.projectId===project.id).every(t=>t.status==='progress'));
    assert.equal(taskState.tasks.find(t=>t.id===2).status,'done');
    assert.equal(projectStore.projectStats.find(p=>p.id===project.id).completionPercent,0);
    assert.equal(projectStore.projectStats.find(p=>p.id===project.id).incomplete,2);
    assert.ok(actions.includes('startCurrentProjectTasks'));
    assert.ok(text(home.root).includes('Робочий проєкт'));
  } finally {stop();globalThis.window=oldWindow;tasks.app.unmount();home.app.unmount();reset();}
});
