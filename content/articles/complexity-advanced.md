<!-- # Продвинутая сложность и оптимизация алгоритмов -->

## Введение

Это продолжение темы про сложность алгоритмов. Здесь мы углубим знания: рассмотрим составные виды сложности, научимся выбирать между временем и памятью, а также разберём реальные примеры оптимизации алгоритмов.

Статья опирается на основы — виды сложности от O(1) до O(n²), нотацию Big-O и способ оценивать алгоритмы. Если вы с ними ещё не знакомы или хотите освежить, начните с [базовой статьи «Сложность алгоритмов»](../complexity/). Как и там, будем опираться на пример с библиотекой, но посмотрим на более сложные сценарии поиска и оптимизации.

## Составные виды сложности

Иногда сложность алгоритма зависит не от одного параметра n, а от нескольких независимых параметров. Рассмотрим такие случаи.

### O(n·k) — Сложность произведения двух параметров

**Определение**: Время выполнения зависит от произведения двух независимых параметров.

**Пример из библиотеки**: Поиск книг по содержимому. В библиотеке n книг, в каждой книге в среднем k глав. Нужно найти все книги, в которых встречаются определённые ключевые слова.

**Сложность:**
- Время: O(n × k × keywords), где keywords — количество ключевых слов (обычно небольшая константа)
- Память: O(n) для хранения результата (в худшем случае все книги)

```python
def find_books_by_keywords(books, keywords):
    result = []
    for book in books:                    # O(n) - проход по книгам
        for chapter in book.chapters:       # O(k) - проход по главам книги
            for keyword in keywords:       # проверка по ключевым словам
                if keyword in chapter.text:
                    result.append(book)
                    break
    return result
```

```java
import java.util.*;

public List<Book> findBooksByKeywords(List<Book> books, Set<String> keywords) {
    List<Book> result = new ArrayList<>();
    for (Book book : books) {                      // O(n) - проход по книгам
        for (Chapter chapter : book.getChapters()) {  // O(k) - проход по главам книги
            for (String keyword : keywords) {        // проверка по ключевым словам
                if (chapter.contains(keyword)) {
                    result.add(book);
                    break;
                }
            }
        }
    }
    return result;
}
```

```go
func FindBooksByKeywords(books []Book, keywords []string) []Book {
    var result []Book
    for _, book := range books {                      // O(n) - проход по книгам
        for _, chapter := range book.Chapters {        // O(k) - проход по главам книги
            for _, keyword := range keywords {         // проверка по ключевым словам
                if strings.Contains(chapter.Text, keyword) {
                    result = append(result, book)
                    break
                }
            }
        }
    }
    return result
}
```

**Когда встречается**: Когда есть вложенные циклы, где внутренний цикл зависит от параметра, который отличается от внешнего (пользователи и их действия, комментарии и слова, документы и элементы в них).

**Примеры задач на LeetCode:**
- **[Group Anagrams](https://leetcode.com/problems/group-anagrams/)** (LeetCode 49) — группировка слов по анаграммам
- **[Top K Frequent Elements](https://leetcode.com/problems/top-k-frequent-elements/)** (LeetCode 347) — поиск k самых частых элементов
- **[K Closest Points to Origin](https://leetcode.com/problems/k-closest-points-to-origin/)** (LeetCode 973) — поиск k ближайших точек

### O(n + m) — Сложность суммы двух параметров

**Определение**: Время выполнения зависит от суммы размеров двух структур данных.

**Пример из библиотеки**: Объединение двух отсортированных каталогов книг в один.

**Визуализация:**

```
catalog1 = [A, C, E, G]      (n = 4 элемента)
catalog2 = [B, D, F, H, J]   (m = 5 элементов)

Шаг 1: сравниваем A и B → A меньше
merged = [A]         i=1, j=0

Шаг 2: сравниваем C и B → B меньше
merged = [A, B]      i=1, j=1

Шаг 3: сравниваем C и D → C меньше
merged = [A, B, C]   i=2, j=1

... продолжаем пока оба массива не закончатся ...

Итого: проходим по каждому элементу ровно один раз
```

**Сложность:**
- Время: O(n + m)
- Память: O(m + n) для хранения объединенного массива

```python
def merge_catalogs(catalog1, catalog2):
    i = j = 0
    merged = []

    while i < len(catalog1) and j < len(catalog2):  # O(n + m)
        if catalog1[i] < catalog2[j]:
            merged.append(catalog1[i])
            i += 1
        else:
            merged.append(catalog2[j])
            j += 1

    # Добавляем оставшиеся элементы
    while i < len(catalog1):  # O(оставшиеся из n)
        merged.append(catalog1[i])
        i += 1

    while j < len(catalog2):  # O(оставшиеся из m)
        merged.append(catalog2[j])
        j += 1

    return merged
```

```java
// Java
import java.util.*;

public static List<String> mergeCatalogs(List<String> catalog1, List<String> catalog2) {
    List<String> merged = new ArrayList<>();
    int i = 0, j = 0;

    while (i < catalog1.size() && j < catalog2.size()) {  // O(n + m)
        if (catalog1.get(i).compareTo(catalog2.get(j)) < 0) {
            merged.add(catalog1.get(i));
            i++;
        } else {
            merged.add(catalog2.get(j));
            j++;
        }
    }

    // Добавляем оставшиеся элементы из catalog1
    while (i < catalog1.size()) {  // O(оставшиеся из n)
        merged.add(catalog1.get(i));
        i++;
    }

    // Добавляем оставшиеся элементы из catalog2
    while (j < catalog2.size()) {  // O(оставшиеся из m)
        merged.add(catalog2.get(j));
        j++;
    }

    return merged;
}
```

```go
// Go
func MergeCatalogs(catalog1, catalog2 []string) []string {
    merged := make([]string, 0, len(catalog1)+len(catalog2))
    i, j := 0, 0

    for i < len(catalog1) && j < len(catalog2) {  // O(n + m)
        if catalog1[i] < catalog2[j] {
            merged = append(merged, catalog1[i])
            i++
        } else {
            merged = append(merged, catalog2[j])
            j++
        }
    }

    // Добавляем оставшиеся элементы из catalog1
    for i < len(catalog1) {  // O(оставшиеся из n)
        merged = append(merged, catalog1[i])
        i++
    }

    // Добавляем оставшиеся элементы из catalog2
    for j < len(catalog2) {  // O(оставшиеся из m)
        merged = append(merged, catalog2[j])
        j++
    }

    return merged
}
```

**Когда встречается**: При обработке нескольких структур данных последовательно (слияние, объединение, поиск в нескольких структурах).

**Ключевая идея:**
- O(n·m) — вложенные циклы, каждый с каждым
- O(n+m) — последовательная обработка, один за другим

**Примеры задач на LeetCode:**
- **[Intersection of Two Arrays](https://leetcode.com/problems/intersection-of-two-arrays/)** (LeetCode 349) — пересечение двух массивов
- **[Merge Sorted Array](https://leetcode.com/problems/merge-sorted-array/)** (LeetCode 88) — слияние двух отсортированных массивов
- **[Intersection of Two Linked Lists](https://leetcode.com/problems/intersection-of-two-linked-lists/)** (LeetCode 160) — поиск точки пересечения двух списков

### O(2ⁿ) — Экспоненциальная сложность

**Определение**: Время выполнения удваивается с каждым добавленным элементом. Возведение в степень — одна из самых быстро растущих функций, поэтому такой сложности стоит избегать.

**Пример**: Генерация всех возможных подмножеств множества из n элементов. Для каждого элемента есть два выбора: либо включить его в подмножество, либо нет. Количество подмножеств удваивается на каждом шаге.

**Сложность**:
Время: O(n × 2ⁿ) — для каждого из n элементов удваиваем количество подмножеств
Память: O(2ⁿ) — храним все подмножества

```python
def generate_all_subsets(elements):
    result = [[]]
    for elem in elements:           # для каждого элемента
        new_subsets = []
        for subset in result:       # количество подмножеств удваивается
            new_subsets.append(subset + [elem])
            new_subsets.append(subset)
        result = new_subsets
    return result
```

```java
import java.util.*;

public List<List<Integer>> generateAllSubsets(int[] elements) {
    List<List<Integer>> result = new ArrayList<>();
    result.add(new ArrayList<>());  // добавляем пустое подмножество

    for (int elem : elements) {           // для каждого элемента
        List<List<Integer>> newSubsets = new ArrayList<>();
        for (List<Integer> subset : result) {       // количество подмножеств удваивается
            // Создаем копию текущего подмножества и добавляем элемент
            List<Integer> withElem = new ArrayList<>(subset);
            withElem.add(elem);
            newSubsets.add(withElem);
            // Сохраняем также оригинальное подмножество без элемента
            newSubsets.add(subset);
        }
        result = newSubsets;
    }
    return result;
}
```

```go
func GenerateAllSubsets(elements []int) [][]int {
    result := [][]int{{}}  // начинаем с пустого подмножества

    for _, elem := range elements {           // для каждого элемента
        newSubsets := [][]int{}
        for _, subset := range result {       // количество подмножеств удваивается
            withElem := make([]int, len(subset))
            copy(withElem, subset)
            withElem = append(withElem, elem)
            newSubsets = append(newSubsets, withElem)
            newSubsets = append(newSubsets, subset)
        }
        result = newSubsets
    }
    return result
}
```

**Важно**: Этот пример работает для массива с уникальными элементами. Если в массиве есть дубликаты, то будут сгенерированы повторяющиеся подмножества. Для обработки дубликатов нужна дополнительная логика (сортировка + пропуск повторяющихся элементов).

**Когда встречается:**
- Перебор всех подмножеств (subset sum problem)
- Задачи о рюкзаке (brute force)
- Взлом паролей полным перебором
- Комбинаторные задачи без оптимизации

**Почему это плохо**: Для n=20 уже более миллиона операций (2²⁰ = 1,048,576). Для n=30 — более миллиарда.

**Как оптимизировать:**
- Динамическое программирование — избегаем повторных вычислений, используя таблицу
- Мемоизация — сохраняем результаты дорогих операций в кэше
- [Жадные алгоритмы (greedy)](https://en.wikipedia.org/wiki/Greedy_algorithm) — делаем локально оптимальный выбор на каждом шаге
- [Метод ветвей и границ (branch and bound)](https://en.wikipedia.org/wiki/Branch_and_bound) — отсекаем ветви поиска, которые точно не дадут оптимального решения

**Примеры задач на LeetCode:**
- **[Partition Equal Subset Sum](https://leetcode.com/problems/partition-equal-subset-sum/)** (LeetCode 416) — можно ли разбить массив на два подмножества с равной суммой
- **[Partition to K Equal Sum Subsets](https://leetcode.com/problems/partition-to-k-equal-sum-subsets/)** (LeetCode 698) — разбиение массива на k подмножеств
- **[Word Break](https://leetcode.com/problems/word-break/)** (LeetCode 139) — можно ли разбить строку на слова из словаря
- **[Palindrome Partitioning](https://leetcode.com/problems/palindrome-partitioning/)** (LeetCode 131) — разбиение строки на палиндромы

### O(n!) — Факториальная сложность

**Определение**: Время выполнения растёт как факториал от n. Это ещё медленнее, чем экспоненциальная сложность.

**Пример**: Задача коммивояжёра — найти кратчайший маршрут, который посещает все города ровно один раз и возвращается в исходный. Для n городов нужно проверить n! вариантов.

**Сложность:**
- Время: O(n! × n) — n! перестановок, каждая вычисляет расстояние за O(n)
- Память: O(n!) — храним все перестановки

```python
def travelling_salesman_bruteforce(cities):
    from itertools import permutations

    min_distance = float('inf')
    best_route = None

    for route in permutations(cities):  # O(n!) - все перестановки городов
        distance = calculate_total_distance(route)  # псевдофункция для вычисления расстояния
        if distance < min_distance:
            min_distance = distance
            best_route = route

    return best_route
```

```java
import java.util.*;

public List<String> travellingSalesmanBruteforce(List<String> cities) {
    List<String> bestRoute = null;
    int minDistance = Integer.MAX_VALUE;
    
    // Генерируем все перестановки городов
    List<List<String>> permutations = generatePermutations(new ArrayList<>(cities));
    
    for (List<String> route : permutations) {  // O(n!) - все перестановки городов
        int distance = calculateTotalDistance(route); // псевдофункция для вычисления расстояния
        if (distance < minDistance) {
            minDistance = distance;
            bestRoute = route;
        }
    }
    
    return bestRoute;
}

private List<List<String>> generatePermutations(List<String> cities) {
    List<List<String>> result = new ArrayList<>();
    if (cities.isEmpty()) {
        result.add(new ArrayList<>());
        return result;
    }
    
    for (int i = 0; i < cities.size(); i++) {
        String current = cities.get(i);
        List<String> remaining = new ArrayList<>(cities);
        remaining.remove(i);
        
        for (List<String> perm : generatePermutations(remaining)) {
            perm.add(0, current);
            result.add(perm);
        }
    }
    return result;
}
```

```go
func TravellingSalesmanBruteforce(cities []string) []string {
    permutations := generatePermutations(cities)
    bestRoute := []string{}
    minDistance := math.MaxInt32
    
    for _, route := range permutations {  // O(n!) - все перестановки городов
        distance := calculateTotalDistance(route) // псевдофункция для вычисления расстояния
        if distance < minDistance {
            minDistance = distance
            bestRoute = route
        }
    }
    
    return bestRoute
}

func generatePermutations(cities []string) [][]string {
    if len(cities) == 0 {
        return [][]string{{}}
    }
    
    result := [][]string{}
    for i, city := range cities {
        remaining := make([]string, 0, len(cities)-1)
        remaining = append(remaining, cities[:i]...)
        remaining = append(remaining, cities[i+1:]...)
        
        for _, perm := range generatePermutations(remaining) {
            route := append([]string{city}, perm...)
            result = append(result, route)
        }
    }
    return result
}
```

**Когда встречается:**
- Задачи коммивояжёра
- Расписания (генерация всех возможных вариантов)
- Перестановки элементов
- N-queens problem (расстановка ферзей без взаимных атак)

**Почему это плохо**: Для n=10 уже 3,628,800 операций. Для n=15 — более 1 триллиона.

**Как оптимизировать:**
- Динамическое программирование с состояниями
- Приближённые алгоритмы (approximation algorithms)
- Эвристики
- Local search (поиск локальных оптимумов)

**Сравнение O(2ⁿ) vs O(n!):**
- O(2ⁿ) — для каждого элемента 2 выбора (да/нет)
- O(n!) — для каждого шага n вариантов, затем (n-1), затем (n-2), и т.д.
- O(n!) растёт быстрее, чем O(2ⁿ), при больших n

**Примеры задач на LeetCode:**
- **[Permutations](https://leetcode.com/problems/permutations/)** (LeetCode 46) — генерация всех перестановок массива
- **[Permutations II](https://leetcode.com/problems/permutations-ii/)** (LeetCode 47) — перестановки с дубликатами
- **[N-Queens](https://leetcode.com/problems/n-queens/)** (LeetCode 51) — расстановка n ферзей на доске n×n
- **[Sudoku Solver](https://leetcode.com/problems/sudoku-solver/)** (LeetCode 37) — решение судоку перебором

## Трейд-офф (компромисс) между временем и памятью

Часто можно обменять использование дополнительной памяти на ускорение алгоритма или наоборот. Такие обмены называются трейд-оффами.

### Основные принципы трейд-оффов

**Когда оптимизируем по времени в ущерб памяти**:
- Доступно много памяти
- Нужна максимальная скорость
- Алгоритм будет вызываться часто

**Когда оптимизируем по памяти в ущерб времени**:
- Память ограничена
- Данные очень большие
- Скорость не критична

### Примеры трейд-оффов

**1. Хэш-таблица**: использует O(n) дополнительной памяти, но обеспечивает O(1) поиск вместо O(n).

**2. Кэширование**: хранит результаты вычислений для повторного использования — тратим память, но экономим время на повторные вычисления.

**3. Динамическое программирование**: тратим O(n²) или O(n·m) память на таблицу, чтобы избежать экспоненциальной сложности O(2ⁿ) или O(n!) и получить полиномиальное решение O(n·m) или O(n²). 

## Пример: Поиск дубликатов с разными сложностями

Разберём классическую задачу поиска дубликатов и посмотрим, как разные подходы влияют на сложность.

### Метод 1: В лоб — O(n²) время, O(1) память

Сравниваем каждый элемент с каждым.

**Сложность:**
- Время: O(n²)
- Память: O(n) для хранения дубликатов

```python
def find_duplicates_slow(books):
    duplicates = []
    for i in range(len(books)):
        for j in range(i + 1, len(books)):
            if books[i] == books[j]:
                duplicates.append(books[i])
    return list(set(duplicates))
```

```java
import java.util.*;

public class DuplicateFinder {
    public static Set<String> findDuplicatesSlow(List<String> books) {
        Set<String> duplicates = new HashSet<>();
        for (int i = 0; i < books.size(); i++) {
            for (int j = i + 1; j < books.size(); j++) {
                if (books.get(i).equals(books.get(j))) {
                    duplicates.add(books.get(i));
                }
            }
        }
        return duplicates;
    }
}
```

```go
func FindDuplicatesSlow(books []string) []string {
    seen := make(map[string]bool)
    for i := 0; i < len(books); i++ {
        for j := i + 1; j < len(books); j++ {
            if books[i] == books[j] {
                seen[books[i]] = true
                break // Нашли дубликат, переходим к следующей книге
            }
        }
    }

    var result []string
    for book := range seen {
        result = append(result, book)
    }
    return result
}
```

### Метод 2: С сортировкой — O(n log n) время, O(1) память

Сначала сортируем, затем идём по массиву и сравниваем соседние элементы.

```python
def find_duplicates_medium(books):
    books.sort()  # O(n log n)
    duplicates = []
    for i in range(1, len(books)):
        if books[i] == books[i-1]:
            duplicates.append(books[i])
    return list(set(duplicates))
```

```java
import java.util.*;

public class DuplicateFinder {
    public static Set<String> findDuplicatesMedium(List<String> books) {
        Collections.sort(books); // O(n log n)
        Set<String> duplicates = new HashSet<>();
        for (int i = 1; i < books.size(); i++) {
            if (books.get(i).equals(books.get(i-1))) {
                duplicates.add(books.get(i));
            }
        }
        return duplicates;
    }
}
```

```go
import "sort"

func FindDuplicatesMedium(books []string) []string {
    sort.Strings(books) // O(n log n)
    seen := make(map[string]bool)

    for i := 1; i < len(books); i++ {
        if books[i] == books[i-1] {
            seen[books[i]] = true
        }
    }

    var result []string
    for book := range seen {
        result = append(result, book)
    }
    return result
}
```

### Метод 3: С хэш-таблицей — O(n) время, O(n) память

Проходим по массиву один раз, запоминая увиденные элементы в HashSet.

**Сложность:**
- Время: O(n)
- Память: O(n) для двух HashSet

```python
def find_duplicates_fast(books):
    seen = set()
    duplicates = set()
    for book in books:  # O(n)
        if book in seen:
            duplicates.add(book)
        else:
            seen.add(book)
    return list(duplicates)
```

```java
import java.util.*;

public class DuplicateFinder {
    public static Set<String> findDuplicatesFast(List<String> books) {
        Set<String> seen = new HashSet<>();
        Set<String> duplicates = new HashSet<>();
        for (String book : books) { // O(n)
            if (seen.contains(book)) {
                duplicates.add(book);
            } else {
                seen.add(book);
            }
        }
        return duplicates;
    }
}
```

```go
func FindDuplicatesFast(books []string) []string {
    seen := make(map[string]bool)
    duplicates := make(map[string]bool)

    for _, book := range books { // O(n)
        if seen[book] {
            duplicates[book] = true
        } else {
            seen[book] = true
        }
    }

    var result []string
    for book := range duplicates {
        result = append(result, book)
    }
    return result
}
```
### Анализ трейд-оффов

| Метод | Время | Память | Когда применять |
|-------|-------|--------|-----------------|
| В лоб | O(n²) | O(1) доп., O(n) для результата | Мало данных, мало памяти |
| С сортировкой | O(n log n) | O(1) доп., O(n) для результата | Можно изменять массив* |
| С хэш-таблицей | O(n) | O(n) доп. для HashSet | Много памяти, нужна скорость |

*\* сортировка меняет порядок элементов в исходном массиве*

**Почему последняя версия O(n)**: мы проходим по массиву один раз, все операции с HashSet (add, contains) в среднем занимают O(1). Поэтому общая сложность O(n) × O(1) = O(n).

## Амортизированная сложность

Возможно, вы уже встречали термин **«амортизированная сложность»** при работе с массивами и хеш-таблицами. Теперь разберём это понятие подробно.

**Определение**: Амортизированная сложность — это средняя сложность операции, если она выполняется многократно. Некоторые операции могут быть дорогими, но происходят редко, а большинство — быстрыми.

**Пример из библиотеки**: Представьте, что вы добавляете книги на полку. Обычно это занимает O(1) времени (просто поставить книгу). Но когда полка заполняется, вам нужно достать все книги и перенести их на новую, большую полку — это дорогая операция O(n). Однако такая реорганизация происходит редко (каждые 100 книг), поэтому в среднем каждая операция добавления книги занимает примерно O(1) времени.

**Когда встречается**: При работе с динамическими массивами, хэш-таблицами, очередями.

**Визуализация амортизированной сложности**:

```
Операции добавления в динамический массив (capacity = 4):

Шаг 1: [A]           capacity = 4,  добавили A     → O(1)  (быстрая)
Шаг 2: [A, B]        capacity = 4,  добавили B     → O(1)  (быстрая)
Шаг 3: [A, B, C]     capacity = 4,  добавили C     → O(1)  (быстрая)
Шаг 4: [A,B,C,D]     capacity = 4,  добавили D     → O(1)  (быстрая)

Шаг 5: [A,B,C,D,E]   capacity = 8,  добавили E     → O(5)  (медленная: расширяем массив и копируем все 5 элементов)

Шаг 6: [A,B,C,D,E,F] capacity = 8, добавили F      → O(1)  (быстрая)
Шаг 7: [A,B,C,D,E,F,G] capacity = 8, добавили G    → O(1)  (быстрая)
Шаг 8: [A,B,C,D,E,F,G,H] capacity = 8, добавили H  → O(1)  (быстрая)
Шаг 9: [...]         capacity = 16,                → O(9)  (медленная: расширяем массив и копируем все 9 элементов)

Анализ:
- 4 быстрые операции (O(1))
- 1 медленная операция (O(n))
- 7 быстрых операций (O(1))
- 1 медленная операция (O(n))
- ...

Средняя стоимость: (1+1+1+1+5+1+1+1+1+1+9+...) / n ≈ O(1) амортизированная
```

**Классические примеры:**
- **Динамический массив (ArrayList)**: добавление элемента в среднем O(1), но O(n) при необходимости расширения массива
- **Хэш-таблица**: вставка в среднем O(1), но O(n) при перехэшировании когда много коллизий

**Почему это важно**: Амортизированный анализ помогает понять реальную производительность структур данных, где отдельные операции могут быть медленными, но в среднем алгоритм работает эффективно.

**Примеры задач на LeetCode:**
- **[Design HashMap](https://leetcode.com/problems/design-hashmap/)** (LeetCode 706) — реализация хэш-таблицы с перехэшированием
- **[Design Twitter](https://leetcode.com/problems/design-twitter/)** (LeetCode 355) — дизайн системы с эффективными операциями
- **[Implement Stack using Queues](https://leetcode.com/problems/implement-stack-using-queues/)** (LeetCode 225) — реализация стека на очередях

### Почему это важно на интервью

На интервью вас могут спросить: "Какая сложность вставки в ArrayList?"
Правильный ответ: "O(1) амортизированная", а не просто "O(1)". Это показывает, что вы понимаете, как работают структуры данных "под капотом".

---

## Заключение

В этой статье мы разобрали составные виды сложности, научились выбирать между временем и памятью и увидели, как разные подходы к одной и той же задаче приводят к разным сложностям.

**Что важно запомнить:**

1. **Составные виды сложности:**
   - O(n·k) — произведение параметров (вложенные циклы с разными размерами)
   - O(n + m) — сумма параметров (последовательная обработка структур)
   - O(2ⁿ) и O(n!) — избегать, использовать оптимизации (DP, greedy, эвристики)

2. **Трейд-офф время/память:**
   - Хэш-таблица: O(n) память → O(1) поиск
   - Сортировка + бинарный поиск: O(n log n) подготовка → O(log n) поиск
   - Кэширование: тратим память → экономим время вычислений

3. **Выбор алгоритма зависит от ограничений:**
   - Много данных? → O(n) или O(n log n) алгоритмы
   - Мало памяти? → O(1) или O(log n) дополнительной памяти
   - Частые вызовы? → оптимизируем по времени
   - Ограниченное время? → используем больше памяти

4. **Амортизированная сложность:**
   - Отдельные операции могут быть O(n), но в среднем O(1)
   - Важно для динамических массивов и хэш-таблиц
   - На интервью говорите "амортизированная O(1)", а не просто "O(1)"
