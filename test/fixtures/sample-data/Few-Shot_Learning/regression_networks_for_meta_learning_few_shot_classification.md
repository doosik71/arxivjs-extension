# Regression Networks for Meta-Learning Few-Shot Classification

Arnout Devos and Matthias Grossglauser (2020)

## 🧩 Problem to Solve

본 논문은 **Few-shot classification** 문제를 해결하고자 한다. Few-shot classification이란 학습 과정에서 보지 못한 새로운 클래스들에 대해, 클래스당 단 몇 개의 예시(shot)만 주어진 상태에서 새로운 데이터의 클래스를 정확하게 분류해야 하는 과제이다.

전통적인 지도 학습(Supervised Learning)이나 강화 학습(Reinforcement Learning) 방식은 새로운 작업에 적응하기 위해 막대한 양의 데이터와 학습 시간이 필요하다는 한계가 있다. 특히 고차원 임베딩 공간에서 데이터의 '크기(magnitude)'보다 '방향(direction)'이 더 풍부한 정보를 담고 있다는 점과, 클래스 대표값(aggregated class representations)을 사용하는 최신 metric-learning 방법론들이 우수한 성능을 보인다는 점에 주목하여, 이를 결합한 새로운 분류 체계를 구축하는 것이 본 연구의 목표이다.

## ✨ Key Contributions

본 논문의 핵심 아이디어는 각 클래스를 단일 점(centroid)이 아닌 **벡터 부분공간(vector subspace)**으로 표현하고, 쿼리 지점에서 해당 부분공간으로의 **회귀 오차(regression error)**를 거리 척도로 사용하는 것이다.

구체적으로, 동일한 클래스에 속하는 데이터들은 임베딩 공간 내에서 특정 선형 결합으로 근사될 수 있다는 가정을 세운다. 이를 위해 신경망을 통해 입력 데이터를 임베딩 공간으로 매핑하고, 각 클래스의 서포트 셋(support set)이 형성하는 부분공간 내에서 쿼리 포인트에 가장 가까운 지점을 회귀 분석(regression)을 통해 찾아내어 그 잔차를 거리로 정의한다. 이는 단순한 거리 비교를 넘어 클래스의 구조적 정보를 더 풍분하게 활용하려는 시도이다.

## 📎 Related Works

본 연구는 다음과 같은 기존 연구들과의 관계 및 차별점을 가진다.

1. **Metric-learning 기반 방법론**: MatchingNet은 순수하게 방향성 정보만을 활용하며, ProtoNet과 RelationNet은 클래스의 집계된 표현(aggregated representations)을 사용하여 성능을 개선하였다. 본 제안 방법은 이 두 가지 장점(방향성 정보 + 집계된 표현)을 모두 수용한다.
2. **Linear Regression Classification (LRC)**: 얼굴 인식 등을 위해 각 클래스를 벡터 부분공간으로 표현하는 방식이다. 하지만 LRC는 선형 임베딩에 의존하는 반면, 본 논문은 신경망을 이용한 비선형 임베딩과 에피소드 학습(episodic training)을 결합하여 Few-shot 시나리오에 적용하였다.
3. **Affine Subspaces 연구**: Simon et al. (2018)은 아핀 부분공간(affine subspaces)을 탐구하였으나, 이는 1-shot 학습 환경에서는 구축이 불가능하다는 한계가 있다. 반면 본 논문이 제안하는 벡터 부분공간 방식은 1-shot에서도 동작 가능하다.
4. **R2D2**: 정규화된 선형 회귀를 분류기로 사용하지만, 본 논문의 RegressionNet은 LRC의 철학을 계승하여 본질적으로 분류 문제에 최적화된 구조를 가진다.

## 🛠️ Methodology

### 1. 전체 파이프라인

전체 시스템은 입력 데이터를 고차원 임베딩 공간으로 보내는 함수 $f_\phi$와, 임베딩된 포인트와 클래스 부분공간 사이의 거리를 계산하는 회귀 기반의 거리 함수 $\tilde{d}$로 구성된다.

### 2. 클래스 부분공간 구축

$N$-way $K$-shot 문제에서, 각 클래스 $n$에 대해 $K$개의 서포트 예시가 주어지면 이를 임베딩 함수 $f_\phi: \mathbb{R}^D \to \mathbb{R}^M$를 통해 매핑한다. 클래스 $n$의 부분공간 행렬 $S_n \in \mathbb{R}^{M \times K}$는 다음과 같이 정의된다.
$$S_n = [f_\phi(x_{n1}) \dots f_\phi(x_{nK})]$$

### 3. 회귀 기반 거리 측정

쿼리 포인트 $e_i \in \mathbb{R}^M$와 클래스 부분공간 $S_n$ 사이의 거리 $\tilde{d}(e_i, S_n)$는 $S_n$의 열벡터들의 선형 결합으로 $e_i$를 가장 잘 근사하는 지점을 찾는 최소자승법(least-squares) 문제로 정의된다.
$$\tilde{d}(e_i, S_n) = \min_a \|e_i - S_n a\|^2$$

이 문제는 닫힌 형태의 해(closed-form solution)를 가지며, 다음과 같이 계산된다.
$$\tilde{d}(e_i, S_n) = \|e_i - P_n e_i\|^2$$
여기서 $P_n$은 $e_i$를 부분공간 $S_n$으로 직교 투영(orthogonal projection)시키는 변환 행렬이며, 수치적 안정성을 위해 작은 값 $\lambda_1$을 더해 다음과 같이 계산한다.
$$P_n = S_n (S_n^T S_n + \lambda_1 I)^{-1} S_n^T$$

### 4. 분류 및 학습 목표

쿼리 포인트 $x$가 클래스 $n$에 속할 확률은 각 클래스 부분공간으로의 거리 $\tilde{d}$에 대해 Softmax를 적용하여 결정한다.
$$p_\phi(y=n|x) = \frac{\exp(-\tilde{d}(f_\phi(x), S_n))}{\sum_{n'} \exp(-\tilde{d}(f_\phi(x), S_{n'}))}$$
학습은 정답 클래스에 대한 Negative Log-Probability를 최소화하는 방향으로 진행된다.

### 5. 부분공간 직교화 (Subspace Orthogonalization)

학습 시 각 클래스의 부분공간들이 서로 최대한 다른 방향을 가지도록 유도하기 위해 다음과 같은 직교화 항을 손실 함수에 추가한다.
$$L_T = L_{base} + \lambda_2 \sum_{i \neq j} \frac{\|S_i^T S_j\|_F^2}{\|S_i\|_F^2 \|S_j\|_F^2}$$
여기서 $\|\cdot\|_F$는 Frobenius norm이며, $\lambda_2$는 하이퍼파라미터이다.

## 📊 Results

### 1. 실험 설정

- **데이터셋**: mini-ImageNet, CUB-200-2011
- **백본 네트워크**: Conv-4, ResNet-10, ResNet-34
- **비교 대상**: MatchingNet, ProtoNet, RelationNet, MAML, R2D2
- **평가 지표**: 5-way 1-shot 및 5-shot 정확도(%)

### 2. 주요 결과

- **Shot 수에 따른 성능**: 모든 방법론에서 Shot 수가 1에서 5로 증가할 때 성능이 향상되었으나, 특히 RegressionNet은 5-shot 설정에서 타 모델들을 유의미하게 앞섰다. 이는 풍부한 클래스 표현(부분공간)을 활용하는 능력이 더 많은 데이터가 주어질 때 극대화됨을 시사한다.
- **백본 깊이의 영향**: 백본이 깊어질수록(Conv-4 $\to$ ResNet-10 $\to$ ResNet-34) RegressionNet과 ProtoNet의 성능 향상 폭이 컸으며, ResNet-10 이상의 깊이에서는 RegressionNet이 가장 우수한 성능을 보였다.
- **직교화 효과**: Ablation study 결과, 부분공간 직교화 항($\lambda_2 > 0$)을 추가했을 때 정확도가 최대 2%까지 향상됨을 확인하였다.
- **도메인 전이(Domain Shift)**: mini-ImageNet $\to$ CUB 및 CUB $\to$ mini-ImageNet 실험에서 RegressionNet은 다른 metric-learning 기반 방법들보다 더 높은 일반화 성능을 보였다.

## 🧠 Insights & Discussion

본 논문은 고차원 공간에서 점과 점 사이의 거리보다 **점과 부분공간 사이의 거리**를 측정하는 것이 클래스의 정체성을 더 잘 포착할 수 있음을 입증하였다. 특히 5-shot과 같이 서포트 셋이 어느 정도 확보된 상황에서, 단순한 평균값(centroid)을 사용하는 ProtoNet보다 부분공간을 형성하는 RegressionNet이 훨씬 강력한 표현력을 가짐을 보여주었다.

또한, 부분공간 직교화 손실 함수를 통해 클래스 간의 변별력을 강제로 높인 점이 성능 향상에 기여하였다. 다만, 본 연구에서는 부분공간의 랭크(rank)를 그대로 사용하였는데, 향후 저차원 근사(low-rank approximation)를 통해 계산 효율성을 높이거나 노이즈를 제거하는 방향의 연구가 필요할 것으로 보인다.

## 📌 TL;DR

본 논문은 Few-shot 분류 문제를 해결하기 위해 각 클래스를 벡터 부분공간으로 모델링하고, 쿼리 포인트에서 이 부분공간으로의 **선형 회귀 오차를 거리 척도로 사용하는 RegressionNet**을 제안하였다. 이 방법은 특히 백본 네트워크가 깊고 Shot 수가 많을 때 매우 강력한 성능을 보이며, 기존의 centroid 기반 방식보다 풍부한 클래스 표현을 학습할 수 있다. 결과적으로 고차원 임베딩 공간의 방향성 정보를 효율적으로 활용하여 Few-shot classification의 성능을 높였으며, 뛰어난 도메인 일반화 능력을 보였다.
